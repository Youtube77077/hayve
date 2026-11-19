import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { getSessionUserId, onSessionChange } from '../backend/api/session';
import { getVersion, HayveError, subscribe } from '../backend/store';
import { useToast } from '../design/components/feedback';

/** Re-renders whenever backend data changes. */
export function useDataVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function useSessionId() {
  return useSyncExternalStore(onSessionChange, getSessionUserId, getSessionUserId);
}

/**
 * Runs a synchronous API query and keeps it live: results recompute when the
 * data or the signed-in user changes. Errors are returned instead of thrown.
 */
export function useLive<T>(fn: () => T, deps: unknown[] = []): { data: T | undefined; error: HayveError | Error | null } {
  const v = useDataVersion();
  const s = useSessionId();
  return useMemo(() => {
    try {
      return { data: fn(), error: null };
    } catch (e) {
      return { data: undefined, error: e as Error };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, s, ...deps]);
}

/** Wraps a mutation with loading state and toast feedback. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <R,>(fn: () => R | Promise<R>, opts: { success?: string; onDone?: (r: R) => void; onError?: (e: Error) => void } = {}) => {
      setBusy(true);
      try {
        const r = await fn();
        if (opts.success) toast(opts.success, 'success');
        opts.onDone?.(r);
        return r;
      } catch (e) {
        const err = e as Error;
        toast(err.message || 'Something went wrong', 'error');
        opts.onError?.(err);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}
