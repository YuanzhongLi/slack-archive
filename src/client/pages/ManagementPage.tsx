import { useState } from 'react';
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
  return (
    <tr className="border-t border-gray-700 text-sm">
      <td className="py-2 px-3 text-gray-300">{formatDate(log.startedAt)}</td>
      <td className="py-2 px-3 text-gray-300">{log.triggeredBy}</td>
      <td className="py-2 px-3 text-gray-400">{log.userEmail ?? '-'}</td>
      <td className="py-2 px-3">
        {log.status === 'success' ? (
          <span className="text-green-400">success</span>
        ) : (
          <span className="text-red-400">error</span>
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

export default function ManagementPage() {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
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
        setSyncResult(`Error: ${json.message ?? 'Unknown error'}`);
      } else {
        setSyncResult(
          `Done — ${json.channelCount ?? 0} channels, ${json.messageCount ?? 0} messages`,
        );
      }
    } catch {
      setSyncResult('Error: Request failed');
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
          ← Back
        </button>
        <h1 className="font-bold text-lg">Management</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Manual sync */}
        <section>
          <h2 className="text-base font-semibold mb-3">Manual Sync</h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
            >
              {syncing ? 'Syncing…' : 'Run Sync Now'}
            </button>
            {syncResult && (
              <p
                className={`text-sm ${syncResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}
              >
                {syncResult}
              </p>
            )}
          </div>
        </section>

        {/* Cron schedule */}
        <section>
          <h2 className="text-base font-semibold mb-3">Cron Schedule</h2>
          <p className="text-sm text-gray-300">
            <code className="bg-gray-800 px-2 py-1 rounded">0 17 * * *</code>
            <span className="ml-2 text-gray-400">— daily at 17:00 UTC</span>
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Also runs a full resync of messages from 90–87 days ago to capture edits and deletions.
          </p>
        </section>

        {/* Sync history */}
        <section>
          <h2 className="text-base font-semibold mb-3">Sync History</h2>
          {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {error && <p className="text-sm text-red-400">Failed to load sync history</p>}
          {data && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider">
                    <th className="py-2 px-3">Started At</th>
                    <th className="py-2 px-3">Trigger</th>
                    <th className="py-2 px-3">User</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Channels</th>
                    <th className="py-2 px-3">Messages</th>
                    <th className="py-2 px-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 px-3 text-sm text-gray-500">
                        No sync history yet.
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
