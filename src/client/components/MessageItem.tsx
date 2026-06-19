import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types/api';
import Avatar from './Avatar';
import Timestamp from './Timestamp';

type MessageItemProps = {
  message: Message;
  onThreadOpen: (ts: string) => void;
  canDelete?: boolean;
  onDelete?: (id: string) => void;
};

export default function MessageItem({
  message,
  onThreadOpen,
  canDelete = false,
  onDelete,
}: MessageItemProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(t('messageItem.confirmDeleteMessage'))) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await fetch(`/api/archive/messages/${message.id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json() as Promise<unknown>;
      });
      onDelete?.(message.id);
    } catch {
      setErrorMsg(t('messageItem.deleteError'));
      setDeleting(false);
    }
  }

  const showDeleteButton = canDelete && message.isDeletable;

  return (
    <div className="flex gap-3 py-2 px-4 hover:bg-gray-800/50 group">
      <Avatar user={message.user} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-gray-100 text-sm">{message.user.displayName}</span>
          <Timestamp slackTs={message.slackTs} />
          {showDeleteButton && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs transition-opacity"
            >
              {t('messageItem.deleteMessage')}
            </button>
          )}
        </div>
        <p className="text-gray-100 text-sm whitespace-pre-wrap break-words mt-0.5">
          {message.text}
        </p>
        {errorMsg && <p className="text-xs text-red-400 mt-0.5">{errorMsg}</p>}
        {message.replyCount > 0 && (
          <button
            type="button"
            onClick={() => onThreadOpen(message.slackTs)}
            className="mt-1 text-sm text-blue-400 hover:text-blue-300 hover:underline"
          >
            {t('messageItem.reply', { count: message.replyCount })}
          </button>
        )}
      </div>
    </div>
  );
}
