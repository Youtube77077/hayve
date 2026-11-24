import { router, usePathname } from 'expo-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { getSessionUserId, onSessionChange } from '../backend/api/session';
import { getVersion, HayveError, subscribe } from '../backend/store';
import { useToast } from '../design/components/feedback';
import { setReturnTo } from './returnTo';

/** Stable empty array for `useLive(...).data ?? NONE` defaults. */
export const NONE: never[] = [];

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
  const pathname = usePathname();
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
        // Browsing without an account: the first real action (pay, book, sell) asks to save your setup,
        // then brings you back here.
        if (err instanceof HayveError && err.code === 'unauthenticated') {
          setReturnTo(pathname);
          toast('Save your setup to continue. It takes a minute.', 'info');
          router.push('/sign-up');
          return undefined;
        }
        toast(err.message || 'Something went wrong', 'error');
        opts.onError?.(err);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast, pathname],
  );
  return { run, busy };
}
