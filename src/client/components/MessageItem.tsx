import type { Message } from '../types/api';
import Avatar from './Avatar';
import Timestamp from './Timestamp';

type MessageItemProps = {
  message: Message;
  onThreadOpen: (ts: string) => void;
};

export default function MessageItem({ message, onThreadOpen }: MessageItemProps) {
  return (
    <div className="flex gap-3 py-2 px-4 hover:bg-gray-800/50 group">
      <Avatar user={message.user} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-gray-100 text-sm">{message.user.displayName}</span>
          <Timestamp slackTs={message.slackTs} />
        </div>
        <p className="text-gray-100 text-sm whitespace-pre-wrap break-words mt-0.5">
          {message.text}
        </p>
        {message.replyCount > 0 && (
          <button
            type="button"
            onClick={() => onThreadOpen(message.slackTs)}
            className="mt-1 text-sm text-blue-400 hover:text-blue-300 hover:underline"
          >
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>
    </div>
  );
}
