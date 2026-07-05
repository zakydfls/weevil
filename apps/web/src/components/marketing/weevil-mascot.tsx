'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { WeevilMark } from '@/components/brand/weevil-mark';

const WeevilMascot3D = dynamic(() => import('./weevil-mascot-3d'), { ssr: false });

/**
 * The hero's signature "wow" — a real 3D weevil that idles, watches the
 * cursor, and scurries on hover/click. Falls back to the flat, breathing
 * `WeevilMark` on small viewports (mobile battery/perf) and under
 * `prefers-reduced-motion` (a static pose, no WebGL mount at all).
 */
export function WeevilMascot({ className }: { className?: string }) {
  const [mode, setMode] = useState<'pending' | '3d' | 'reduced' | 'flat'>('pending');

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSmallViewport = window.innerWidth < 768;
    if (reduced) {
      setMode('reduced');
    } else if (isSmallViewport) {
      setMode('flat');
    } else {
      setMode('3d');
    }
  }, []);

  if (mode === 'pending') {
    return <div className={className} />;
  }

  if (mode === 'flat') {
    return (
      <div className={`grid place-items-center ${className ?? ''}`}>
        <WeevilMark size={96} tone="primary" className="weevil-mascot" />
      </div>
    );
  }

  return <WeevilMascot3D className={className} reducedMotion={mode === 'reduced'} />;
}
