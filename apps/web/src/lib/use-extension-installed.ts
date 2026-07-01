'use client';

import { useCallback, useEffect, useState } from 'react';
import { detectExtension } from './extension-bridge';

export type ExtensionStatus = 'checking' | 'installed' | 'missing';

/**
 * Detects whether the Weevil browser extension is installed by pinging its
 * content script. Re-checks when the tab regains focus, so if the user installs
 * the extension in another tab and comes back, the UI flips to "installed"
 * without a manual refresh.
 */
export function useExtensionInstalled(): { status: ExtensionStatus; recheck: () => void } {
  const [status, setStatus] = useState<ExtensionStatus>('checking');

  const recheck = useCallback(() => {
    let cancelled = false;
    void detectExtension().then((present) => {
      if (!cancelled) setStatus(present ? 'installed' : 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = recheck();
    function onVisible() {
      if (document.visibilityState === 'visible') recheck();
    }
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cleanup?.();
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [recheck]);

  return { status, recheck };
}
