import { useTranslation } from 'react-i18next';
import { useMessages } from '../hooks/useMessages';
import MessageItem from './MessageItem';

type MessageListProps = {
  channelId: string;
  onThreadOpen: (ts: string) => void;
};

export function formatDateLabel(
  date: Date,
  today: Date,
  t: (key: string) => string,
  locale: string,
): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((todayMidnight.getTime() - d.getTime()) / 86400000);

  if (diffDays === 0) return t('messageList.today');
  if (diffDays === 1) return t('messageList.yesterday');
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function slackTsToDate(slackTs: string): Date {
  return new Date(parseFloat(slackTs) * 1000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function MessageList({ channelId, onThreadOpen }: MessageListProps) {
  const { t, i18n } = useTranslation();
  const { messages, isLoading, error } = useMessages(channelId);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
        {t('messageList.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-red-400 text-sm">
        {t('messageList.error')}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500 text-sm">
        {t('messageList.empty')}
      </div>
    );
  }

  const orderedMessages = [...messages].reverse();
  const today = new Date();

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {orderedMessages.map((message, index) => {
        const msgDate = slackTsToDate(message.slackTs);
        const prevDate = index > 0 ? slackTsToDate(orderedMessages[index - 1].slackTs) : null;
        const showSeparator = !prevDate || !isSameDay(prevDate, msgDate);

        return (
          <div key={message.id}>
            {showSeparator && (
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-xs text-gray-400 font-medium flex-shrink-0">
                  {formatDateLabel(msgDate, today, t, i18n.language)}
                </span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>
            )}
            <MessageItem message={message} onThreadOpen={onThreadOpen} />
          </div>
        );
      })}
    </div>
  );
}
