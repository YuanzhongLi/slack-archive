import useSWR from 'swr';
import type { MessagesResponse } from '../types/api';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Request failed');
    return r.json() as Promise<MessagesResponse>;
  });

export function useMessages(channelId: string | undefined) {
  const { data, error, isLoading } = useSWR<MessagesResponse>(
    channelId ? `/api/channels/${channelId}/messages` : null,
    fetcher,
  );
  return {
    messages: data?.messages ?? [],
    hasMore: data?.hasMore ?? false,
    isLoading,
    error,
  };
}
