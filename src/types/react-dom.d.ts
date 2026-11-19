// react-dom ships with Expo for web but without bundled types; only createPortal is used (web map markers).
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
