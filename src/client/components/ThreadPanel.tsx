import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useThreadReplies } from '../hooks/useThreadReplies';
import type { ThreadReply } from '../types/api';
import Avatar from './Avatar';
import Timestamp from './Timestamp';

type ThreadPanelProps = {
  channelId: string;
  threadTs: string;
  onClose: () => void;
  canDelete?: boolean;
};

type ReplyRowProps = {
  reply: ThreadReply;
  canDelete: boolean;
  onDelete: (id: string) => void;
};

function ReplyRow({ reply, canDelete, onDelete }: ReplyRowProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(t('threadPanel.confirmDeleteReply'))) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await fetch(`/api/archive/threads/${reply.id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json() as Promise<unknown>;
      });
      onDelete(reply.id);
    } catch {
      setErrorMsg(t('threadPanel.deleteError'));
      setDeleting(false);
    }
  }

  const showDeleteButton = canDelete && reply.isDeletable;

  return (
    <div className="flex gap-3 py-2 px-4 hover:bg-gray-700/50 group">
      <Avatar user={reply.user} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-gray-100 text-sm">{reply.user.displayName}</span>
          <Timestamp slackTs={reply.slackTs} />
          {showDeleteButton && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs transition-opacity"
            >
              {t('threadPanel.deleteReply')}
            </button>
          )}
        </div>
        <p className="text-gray-100 text-sm whitespace-pre-wrap break-words mt-0.5">{reply.text}</p>
        {errorMsg && <p className="text-xs text-red-400 mt-0.5">{errorMsg}</p>}
      </div>
    </div>
  );
}

export default function ThreadPanel({
  channelId,
  threadTs,
  onClose,
  canDelete = false,
}: ThreadPanelProps) {
  const { t } = useTranslation();
  const { replies, isLoading, error } = useThreadReplies(channelId, threadTs);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const visibleReplies = replies.filter((r) => !deletedIds.has(r.id));

  function handleDelete(id: string) {
    setDeletedIds((prev) => new Set(prev).add(id));
  }

  return (
    <div className="md:w-80 md:border-l md:relative absolute inset-0 z-20 border-gray-700 bg-gray-800 flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="font-semibold text-gray-100">{t('threadPanel.title')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('threadPanel.closeLabel')}
          className="text-gray-400 hover:text-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
            {t('threadPanel.loading')}
          </div>
        )}

        {error && (
          <div className="flex flex-1 items-center justify-center text-red-400 text-sm">
            {t('threadPanel.error')}
          </div>
        )}

        {!isLoading && !error && visibleReplies.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-gray-500 text-sm">
            {t('threadPanel.empty')}
          </div>
        )}

        {!isLoading &&
          !error &&
          visibleReplies.map((reply) => (
            <ReplyRow key={reply.id} reply={reply} canDelete={canDelete} onDelete={handleDelete} />
          ))}
      </div>
    </div>
  );
}
