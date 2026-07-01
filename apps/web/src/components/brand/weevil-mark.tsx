import type { SVGProps } from 'react';

interface WeevilMarkProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'fill'> {
  size?: number;
  tone?: 'ink' | 'brand' | 'primary' | 'accent' | 'muted' | 'on-primary' | 'on-accent' | 'on-brand';
  withGround?: boolean;
}

const toneColor = {
  ink: 'var(--ink)',
  brand: 'var(--brand)',
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  muted: 'var(--ink-muted)',
  'on-primary': '#ffffff',
  'on-accent': '#ffffff',
  'on-brand': '#ffffff',
} as const;

const backgroundEcho = {
  ink: 'var(--bg)',
  brand: 'var(--bg)',
  primary: 'var(--bg)',
  accent: 'var(--bg)',
  muted: 'var(--bg)',
  'on-primary': 'var(--primary)',
  'on-accent': 'var(--accent)',
  'on-brand': 'var(--brand)',
} as const;

/**
 * Stylized weevil silhouette.
 * - 16-24px (nav): silhouette is legible
 * - 64-96px (empty states): pair with `weevil-mascot` class for breathing motion
 */
export function WeevilMark({
  size = 24,
  tone = 'ink',
  withGround = false,
  className,
  ...rest
}: WeevilMarkProps) {
  const fill = toneColor[tone];
  const echo = backgroundEcho[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Weevil"
      className={className}
      {...rest}
    >
      <title>Weevil</title>
      {/* Antennae — the curved feelers on the snout, the weevil signature */}
      <path
        d="M11.4 17.6 C 8 16, 6 12.5, 6.5 9.5"
        stroke={fill}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M13.5 16.3 C 12.5 13, 13.5 9.5, 16 8"
        stroke={fill}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="6.3" cy="9" r="1.1" fill={fill} />
      <circle cx="16.2" cy="7.7" r="1.1" fill={fill} />

      {/* Snout */}
      <path
        d="M12 18.5 L 8 16 C 7 15.4, 7 14, 8 13.6 L 14 16 Z"
        fill={fill}
      />

      {/* Head */}
      <circle cx="16.5" cy="20" r="3.4" fill={fill} />
      <circle cx="15.4" cy="19.2" r="0.6" fill={echo} opacity="0.7" />

      {/* Elytra (body) */}
      <ellipse cx="29" cy="26" rx="12" ry="9" fill={fill} />
      <path
        d="M29 17 L 29 35"
        stroke={echo}
        strokeWidth="0.7"
        opacity="0.45"
      />

      {/* Pronotum */}
      <ellipse cx="20" cy="23" rx="3.2" ry="3.6" fill={fill} />

      {/* Legs */}
      <path d="M22 32 L 21 36" stroke={fill} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M27 33 L 27 37" stroke={fill} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M33 33 L 34 37" stroke={fill} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M22 21 L 20 17" stroke={fill} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M26 19 L 26 14" stroke={fill} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M33 19 L 35 14" stroke={fill} strokeWidth="1.6" strokeLinecap="round" />

      {withGround ? (
        <path
          d="M5 42 L 43 42"
          stroke={fill}
          strokeWidth="0.5"
          strokeLinecap="round"
          opacity="0.35"
        />
      ) : null}
    </svg>
  );
}

/** Logomark for nav — weevil inside the brand square. */
export function WeevilLogo({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: 'var(--brand)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <WeevilMark size={Math.round(size * 0.7)} tone="on-brand" />
    </div>
  );
}
