import useSWR from 'swr';
import type { ThreadReply } from '../types/api';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Request failed');
    return r.json() as Promise<ThreadReply[]>;
  });

export function useThreadReplies(channelId: string | undefined, ts: string | undefined) {
  const { data, error, isLoading } = useSWR<ThreadReply[]>(
    channelId && ts ? `/api/channels/${channelId}/messages/${ts}/threads` : null,
    fetcher,
  );
  return { replies: data ?? [], isLoading, error };
}
