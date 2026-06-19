import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import type { Channel } from '../types/api';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Request failed');
    return r.json() as Promise<Channel[]>;
  });

type Props = {
  currentUser: {
    role: 'root' | 'admin' | 'viewer';
  };
};

export default function ChannelManagementPage({ currentUser }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: channels, error, isLoading, mutate } = useSWR<Channel[]>('/api/channels', fetcher);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (currentUser.role === 'viewer') {
    return <Navigate to="/" replace />;
  }

  function clearMessages() {
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  async function handleDeleteChannel(channel: Channel) {
    if (!window.confirm(t('channelManagement.confirmDeleteChannel', { name: channel.name }))) {
      return;
    }
    clearMessages();
    setDeletingId(channel.id);
    try {
      await fetch(`/api/archive/channels/${channel.id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json() as Promise<unknown>;
      });
      setSuccessMsg(t('channelManagement.deleteSuccess'));
      await mutate();
    } catch {
      setErrorMsg(t('channelManagement.deleteError'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <header className="p-4 border-b border-gray-700 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/management')}
          className="text-gray-400 hover:text-white text-sm"
        >
          {t('common.back')}
        </button>
        <h1 className="font-bold text-lg">{t('channelManagement.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
        {successMsg && <p className="text-sm text-green-400">{successMsg}</p>}

        {isLoading && <p className="text-sm text-gray-400">{t('channelManagement.loading')}</p>}
        {error && <p className="text-sm text-red-400">{t('channelManagement.loadError')}</p>}

        {channels && channels.length === 0 && (
          <p className="text-sm text-gray-400">{t('channelManagement.empty')}</p>
        )}

        {channels && channels.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 px-3">{t('channelManagement.channelCol')}</th>
                  <th className="py-2 px-3">{t('channelManagement.actionsCol')}</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.id} className="border-t border-gray-700 text-sm">
                    <td className="py-2 px-3 text-gray-300">#{channel.name}</td>
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        disabled={deletingId !== null}
                        onClick={() => handleDeleteChannel(channel)}
                        className="px-2 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs transition-colors"
                      >
                        {t('channelManagement.deleteChannel')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
