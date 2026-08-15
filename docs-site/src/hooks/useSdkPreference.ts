import {useCallback, useEffect, useState, useSyncExternalStore} from 'react';
import {SDK_STORAGE_KEY, resolveSdkPreference, type SdkName} from '../lib/sdkPreference.mjs';

export type {SdkName} from '../lib/sdkPreference.mjs';
const EVENT = 'masterseed-sdk-change';

const read = (): SdkName => {
  if (typeof window === 'undefined') return 'typescript';
  return resolveSdkPreference(
    new URLSearchParams(window.location.search).get('sdk'),
    window.localStorage.getItem(SDK_STORAGE_KEY),
  ) as SdkName;
};

const subscribe = (fn: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  window.addEventListener('popstate', fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('popstate', fn);
    window.removeEventListener('storage', fn);
  };
};

export function useSdkPreference(): [SdkName, (next: SdkName) => void] {
  const client = useSyncExternalStore(subscribe, read, () => 'typescript' as SdkName);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const set = useCallback((next: SdkName) => {
    window.localStorage.setItem(SDK_STORAGE_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set('sdk', next);
    window.history.replaceState({}, '', url);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [hydrated ? client : 'typescript', set];
}
