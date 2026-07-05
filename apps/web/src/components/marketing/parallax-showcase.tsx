'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

/**
 * A real product screenshot mounted in a mouse-reactive 3D perspective
 * frame. Pure CSS transforms (no WebGL) — this is the "premium hero stage"
 * treatment, not a decorative mockup.
 */
export function ParallaxShowcase({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (reducedMotion) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -10, y: px * 14 });
  }

  function handlePointerLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div className={`[perspective:1600px] ${className ?? ''}`}>
      <div
        ref={frameRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="relative transition-transform duration-300 ease-out [transform-style:preserve-3d]"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        {/* Ambient glow behind the panel, deepest layer */}
        <div
          className="absolute -inset-10 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,var(--primary-soft),transparent)] opacity-70 blur-2xl"
          style={{ transform: 'translateZ(-120px)' }}
          aria-hidden
        />

        <div
          className="overflow-hidden rounded-2xl border border-[var(--border-strong)] shadow-[0_30px_60px_-20px_rgb(26_29_18_/_0.35)]"
          style={{ transform: 'translateZ(0px)' }}
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            priority
            className="h-auto w-full select-none"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
