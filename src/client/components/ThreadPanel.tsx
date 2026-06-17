import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThreadReplies } from '../hooks/useThreadReplies';
import Avatar from './Avatar';
import Timestamp from './Timestamp';

type ThreadPanelProps = {
  channelId: string;
  threadTs: string;
  onClose: () => void;
};

export default function ThreadPanel({ channelId, threadTs, onClose }: ThreadPanelProps) {
  const { t } = useTranslation();
  const { replies, isLoading, error } = useThreadReplies(channelId, threadTs);

  return (
    <div className="w-80 border-l border-gray-700 bg-gray-800 flex flex-col flex-shrink-0">
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

        {!isLoading && !error && replies.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-gray-500 text-sm">
            {t('threadPanel.empty')}
          </div>
        )}

        {!isLoading &&
          !error &&
          replies.map((reply) => (
            <div key={reply.id} className="flex gap-3 py-2 px-4 hover:bg-gray-700/50">
              <Avatar user={reply.user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-100 text-sm">
                    {reply.user.displayName}
                  </span>
                  <Timestamp slackTs={reply.slackTs} />
                </div>
                <p className="text-gray-100 text-sm whitespace-pre-wrap break-words mt-0.5">
                  {reply.text}
                </p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
