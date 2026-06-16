import { clsx } from 'clsx';
import { useChannels } from '../hooks/useChannels';

type ChannelListProps = {
  selectedChannelId?: string;
  onSelect: (channelId: string) => void;
};

export default function ChannelList({ selectedChannelId, onSelect }: ChannelListProps) {
  const { channels, isLoading, error } = useChannels();

  if (isLoading) {
    return <p className="px-2 py-1 text-sm text-gray-400">Loading channels...</p>;
  }

  if (error) {
    return <p className="px-2 py-1 text-sm text-red-400">Failed to load channels</p>;
  }

  return (
    <ul className="w-full">
      {channels.map((channel) => (
        <li key={channel.id}>
          <button
            type="button"
            onClick={() => onSelect(channel.id)}
            className={clsx(
              'w-full text-left px-2 py-1 rounded text-sm truncate transition-colors',
              channel.id === selectedChannelId
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-700/50 hover:text-white',
            )}
          >
            # {channel.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
