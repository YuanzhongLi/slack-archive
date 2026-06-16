import useSWR from 'swr';
import type { Channel } from '../types/api';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Request failed');
    return r.json() as Promise<Channel[]>;
  });

export function useChannels() {
  const { data, error, isLoading } = useSWR<Channel[]>('/api/channels', fetcher);
  return { channels: data ?? [], isLoading, error };
}
