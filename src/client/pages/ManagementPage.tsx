import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR, { mutate as globalMutate } from 'swr';
import type { SyncLog, SyncLogsResponse } from '../types/api';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Request failed');
    return r.json() as Promise<SyncLogsResponse>;
  });

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function SyncLogRow({ log }: { log: SyncLog }) {
  const { t } = useTranslation();
  return (
    <tr className="border-t border-gray-700 text-sm">
      <td className="py-2 px-3 text-gray-300">{formatDate(log.startedAt)}</td>
      <td className="py-2 px-3 text-gray-300">{log.triggeredBy}</td>
      <td className="py-2 px-3 text-gray-400">{log.userEmail ?? '-'}</td>
      <td className="py-2 px-3">
        {log.status === 'success' ? (
          <span className="text-green-400">{t('management.statusSuccess')}</span>
        ) : (
          <span className="text-red-400">{t('management.statusError')}</span>
        )}
      </td>
      <td className="py-2 px-3 text-gray-300">
        {log.channelCount != null ? log.channelCount : '-'}
      </td>
      <td className="py-2 px-3 text-gray-300">
        {log.messageCount != null ? log.messageCount : '-'}
      </td>
      <td className="py-2 px-3 text-gray-400 max-w-xs truncate">{log.errorMessage ?? '-'}</td>
    </tr>
  );
}

type SyncResult = { type: 'success' | 'error'; text: string };

export default function ManagementPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const { data, error, isLoading, mutate } = useSWR<SyncLogsResponse>('/api/sync', fetcher);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const json = (await res.json()) as {
        status: string;
        channelCount?: number;
        messageCount?: number;
        message?: string;
      };
      if (!res.ok) {
        setSyncResult({
          type: 'error',
          text: t('management.syncError', { message: json.message ?? 'Unknown error' }),
        });
      } else {
        setSyncResult({
          type: 'success',
          text: t('management.syncDone', {
            channelCount: json.channelCount ?? 0,
            messageCount: json.messageCount ?? 0,
          }),
        });
      }
    } catch {
      setSyncResult({ type: 'error', text: t('management.syncErrorGeneric') });
    } finally {
      setSyncing(false);
      await mutate();
      // Refresh channel list in case new channels were synced
      await globalMutate('/api/channels');
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <header className="p-4 border-b border-gray-700 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-white text-sm"
        >
          {t('common.back')}
        </button>
        <h1 className="font-bold text-lg">{t('management.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Manual sync */}
        <section>
          <h2 className="text-base font-semibold mb-3">{t('management.manualSync')}</h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
            >
              {syncing ? t('management.syncing') : t('management.runSyncNow')}
            </button>
            {syncResult && (
              <p
                className={`text-sm ${syncResult.type === 'error' ? 'text-red-400' : 'text-green-400'}`}
              >
                {syncResult.text}
              </p>
            )}
          </div>
        </section>

        {/* Cron schedule */}
        <section>
          <h2 className="text-base font-semibold mb-3">{t('management.cronSchedule')}</h2>
          <p className="text-sm text-gray-300">
            <code className="bg-gray-800 px-2 py-1 rounded">0 17 * * *</code>
            <span className="ml-2 text-gray-400">{t('management.cronDescription')}</span>
          </p>
          <p className="text-xs text-gray-500 mt-2">{t('management.cronNote')}</p>
        </section>

        {/* Sync history */}
        <section>
          <h2 className="text-base font-semibold mb-3">{t('management.syncHistory')}</h2>
          {isLoading && <p className="text-sm text-gray-400">{t('management.historyLoading')}</p>}
          {error && <p className="text-sm text-red-400">{t('management.historyError')}</p>}
          {data && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider">
                    <th className="py-2 px-3">{t('management.colStartedAt')}</th>
                    <th className="py-2 px-3">{t('management.colTrigger')}</th>
                    <th className="py-2 px-3">{t('management.colUser')}</th>
                    <th className="py-2 px-3">{t('management.colStatus')}</th>
                    <th className="py-2 px-3">{t('management.colChannels')}</th>
                    <th className="py-2 px-3">{t('management.colMessages')}</th>
                    <th className="py-2 px-3">{t('management.colError')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 px-3 text-sm text-gray-500">
                        {t('management.historyEmpty')}
                      </td>
                    </tr>
                  ) : (
                    data.logs.map((log) => <SyncLogRow key={log.id} log={log} />)
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
