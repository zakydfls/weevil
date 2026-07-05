'use client';

import { useEffect, useRef, useState } from 'react';

export interface TrailEvent {
  id: string;
  label: string;
  color: string;
}

/**
 * A vertical rail of event dots — the same colored-dot language as the
 * product's own timeline scrubber (--tl-console, --tl-network, ...) — that
 * lights up section by section as you scroll. The marketing page's own
 * "debugging session" of itself: every signal it captures, told as a scroll.
 * Desktop only; on narrow viewports the sections speak for themselves.
 */
export function EventTrail({ events }: { events: TrailEvent[] }) {
  const [activeId, setActiveId] = useState(events[0]?.id ?? null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const elements = events
      .map((event) => document.getElementById(event.id))
      .filter((el): el is HTMLElement => Boolean(el));

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    elements.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, [events]);

  return (
    <div
      className="pointer-events-none fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-0 lg:flex"
      aria-hidden
    >
      {events.map((event, index) => {
        const isActive = event.id === activeId;
        return (
          <div key={event.id} className="flex flex-col items-center">
            <span
              className={`h-3 w-3 shrink-0 rounded-full ring-2 ring-[var(--bg)] transition-all duration-300 ease-out ${
                isActive ? 'weevil-trail-pulse scale-150' : 'scale-100 opacity-50'
              }`}
              style={{ backgroundColor: event.color, color: event.color }}
            />
            {index < events.length - 1 ? (
              <span className="h-16 w-px bg-[var(--border-strong)]" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
