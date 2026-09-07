"use client";

import { useEffect, useState } from "react";

export type AsyncState<T> = { data: T | null; loading: boolean; error: Error | null };
type Subscribe<T> = (onData: (value: T) => void, onError: (error: Error) => void) => () => void;

export function useRealtime<T>(subscribe: Subscribe<T>, deps: readonly unknown[], enabled = true, initialData: T | null = null): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: initialData, loading: enabled, error: null });

  useEffect(() => {
    let active = true;
    if (!enabled) {
      queueMicrotask(() => {
        if (active) setState({ data: initialData, loading: false, error: null });
      });
      return () => { active = false; };
    }
    queueMicrotask(() => {
      if (active) setState((current) => ({ ...current, loading: true, error: null }));
    });
    const unsubscribe = subscribe(
      (data) => setState({ data, loading: false, error: null }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    );
    return () => { active = false; unsubscribe(); };
    // Dependency values are supplied by each resource hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return state;
}
