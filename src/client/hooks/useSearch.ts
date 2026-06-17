import { useEffect, useRef, useState } from 'react';
import type { SearchResponse } from '../types/api';

const DEBOUNCE_MS = 300;

type SearchState = {
  data: SearchResponse | null;
  isLoading: boolean;
  error: boolean;
};

export function useSearch(q: string) {
  const [state, setState] = useState<SearchState>({ data: null, isLoading: false, error: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (q.trim() === '') {
      setState({ data: null, isLoading: false, error: false });
      return;
    }

    setState((s) => ({ ...s, isLoading: true, error: false }));

    const controller = new AbortController();

    timerRef.current = setTimeout(() => {
      const url = `/api/search?q=${encodeURIComponent(q)}&limit=20&offset=0`;
      fetch(url, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error('Request failed');
          return r.json() as Promise<SearchResponse>;
        })
        .then((data) => setState({ data, isLoading: false, error: false }))
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setState({ data: null, isLoading: false, error: true });
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      controller.abort();
    };
  }, [q]);

  return state;
}
