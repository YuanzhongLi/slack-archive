import { useMessages } from '../hooks/useMessages';
import MessageItem from './MessageItem';

type MessageListProps = {
  channelId: string;
  onThreadOpen: (ts: string) => void;
};

export default function MessageList({ channelId, onThreadOpen }: MessageListProps) {
  const { messages, isLoading, error } = useMessages(channelId);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-red-400 text-sm">
        Failed to load messages.
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500 text-sm">
        No messages yet.
      </div>
    );
  }

  const orderedMessages = [...messages].reverse();

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {orderedMessages.map((message) => (
        <MessageItem key={message.id} message={message} onThreadOpen={onThreadOpen} />
      ))}
    </div>
  );
}
