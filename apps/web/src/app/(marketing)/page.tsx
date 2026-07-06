import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WeevilLogo, WeevilMark } from '@/components/brand/weevil-mark';
import { ParallaxShowcase } from '@/components/marketing/parallax-showcase';
import { WeevilMascot } from '@/components/marketing/weevil-mascot';

export const metadata: Metadata = {
  title: 'Weevil — bug reports that answer their own questions',
  description:
    'Weevil records the screen, console, network, and every action on one scrubbable timeline — so bug reports come with the evidence, not a follow-up question.',
};

const VIEW_REDIRECTS: Record<string, string> = {
  captures: '/captures',
  inbox: '/captures',
  'project-board': '/board',
  board: '/board',
  settings: '/settings',
  platform: '/platform',
};

const STEPS = [
  {
    title: 'Start a capture',
    body: 'Click the Weevil icon in your toolbar, or start recording straight from your dashboard. Then reproduce the bug like you normally would.',
  },
  {
    title: 'Everything gets recorded',
    body: 'Screen, console logs, network requests, and every click — timestamped together in the background while you work.',
    image: { src: '/marketing/panel-console.png', alt: 'Weevil console panel showing a captured TypeError and a failed network request, synced to a timeline', width: 1840, height: 1560 },
  },
  {
    title: 'Scrub the timeline',
    body: "Click any error or failed request and the recording jumps straight to that exact moment. No more guessing which minute matters.",
    image: { src: '/marketing/panel-network.png', alt: 'Weevil network panel showing a failed request with full headers and status code', width: 1840, height: 1054 },
  },
  {
    title: 'Share one link',
    body: "Send it to whoever's fixing it. They open a debugging session, not a wall of text.",
    image: { src: '/marketing/panel-header.png', alt: 'Weevil capture header with a Copy link button', width: 4000, height: 132 },
  },
];

const PRIVACY_POINTS = [
  'Records only while you’ve started an active capture — never silently, never in the background.',
  'Sensitive header values like auth tokens and cookies are redacted by default.',
  'You review every capture before it uploads. Discard it and nothing leaves your device.',
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const capture = typeof params.capture === 'string' ? params.capture : undefined;
  if (capture) {
    redirect(`/c/${capture}`);
  }
  const view = typeof params.view === 'string' ? params.view : undefined;
  if (view) {
    redirect(VIEW_REDIRECTS[view] ?? '/captures');
  }

  return (
    <>
      {/* ── Hero — Committed terracotta ─────────────────────────────── */}
      <section
        id="hero"
        className="relative overflow-hidden bg-[var(--primary)] pb-24 pt-16 sm:pb-32 sm:pt-20"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(circle at 85% 0%, oklch(0.66 0.16 42 / 0.6) 0%, transparent 52%)',
          }}
          aria-hidden
        />

        <div className="relative mx-auto grid w-full max-w-[82rem] gap-16 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-12">
          <div>
            <h1 className="max-w-2xl text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white" style={{ textWrap: 'balance' }}>
              No more &ldquo;what were you doing when it broke?&rdquo;
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-7 text-white/85" style={{ textWrap: 'pretty' }}>
              Weevil records the screen, console, network, and every click on one timeline you
              can scrub like a video. Send the link — skip the follow-up questions.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bg-white text-[var(--primary)] hover:bg-white/90">
                <Link href="/signup">Get started</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto hidden h-64 w-64 shrink-0 sm:block lg:h-72 lg:w-72">
            <WeevilMascot className="h-full w-full" />
          </div>
        </div>

        <div className="relative mx-auto mt-16 w-full max-w-[68rem] px-4 sm:mt-20 sm:px-6">
          <ParallaxShowcase
            src="/marketing/panel-console.png"
            alt="Weevil capture detail view showing synced console errors, network requests, and page context"
            width={1840}
            height={1560}
          />
        </div>
      </section>

      {/* ── How it works — Restrained ────────────────────────────────── */}
      <section id="how-it-works" className="border-b border-[var(--border)] bg-[var(--bg)] py-24 sm:py-32">
        <div className="mx-auto w-full max-w-[82rem] px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.02em] text-[var(--ink)]" style={{ textWrap: 'balance' }}>
              From &ldquo;can&rsquo;t repro&rdquo; to root cause, in four steps.
            </h2>
            <p className="mt-3 max-w-xl text-base leading-7 text-[var(--ink-muted)]">
              It genuinely is a sequence — every capture goes through the same four moments,
              start to share.
            </p>
          </div>

          <div className="mt-16 space-y-20">
            {/* Step 1 has no screenshot yet (nothing's been recorded) — it
                gets a plain lead-in line instead of forcing it into the same
                image-paired shape as the steps that follow. */}
            <p className="max-w-xl text-lg leading-8 text-[var(--ink)]">
              <span className="font-mono text-[var(--ink-faint)]">01</span>{' '}
              <span className="border-b-2 border-[var(--primary)]">{STEPS[0].body}</span>
            </p>

            {STEPS.slice(1).map((step, index) => (
              <div
                key={step.title}
                className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
                  index % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div>
                  <span className="font-mono text-sm text-[var(--ink-faint)]">0{index + 2}</span>
                  <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">{step.title}</h3>
                  <p className="mt-3 max-w-md text-base leading-7 text-[var(--ink-muted)]">{step.body}</p>
                </div>
                <div>
                  <Image
                    src={step.image!.src}
                    alt={step.image!.alt}
                    width={step.image!.width}
                    height={step.image!.height}
                    loading="lazy"
                    className="h-auto w-full rounded-2xl border border-[var(--border-strong)] shadow-[0_20px_50px_-24px_rgb(26_29_18_/_0.3)]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Differentiation — Restrained, cool accent for contrast ──── */}
      <section id="differentiation" className="border-b border-[var(--border)] bg-[var(--surface-cool)] py-24 sm:py-32">
        <div className="mx-auto grid w-full max-w-[82rem] items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.02em] text-[var(--ink)]" style={{ textWrap: 'balance' }}>
              A debugging session, not a log file with a video attached.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--ink-muted)]">
              Most tools bolt a screen recording onto a wall of text and call it a bug report.
              Weevil syncs everything to the same clock: click a console error and the video
              jumps there. Drag the timeline and the network panel lights up with it. It&rsquo;s
              built to be scrubbed, not read.
            </p>
            <p className="mt-6 max-w-lg text-base leading-7 text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--ink)]">Click an error</span> and the
              recording seeks to that exact frame.{' '}
              <span className="font-semibold text-[var(--ink)]">Drag the timeline</span> and
              console, network, and actions highlight together, live.
            </p>
          </div>
          <div className="relative">
            <div
              className="absolute -inset-8 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,var(--accent-cool-soft),transparent)] opacity-80 blur-xl"
              aria-hidden
            />
            <Image
              src="/marketing/panel-network.png"
              alt="Weevil network panel with a request selected, showing headers, status code, and timing synced to the recording"
              width={1840}
              height={1054}
              loading="lazy"
              className="h-auto w-full rounded-2xl border border-[var(--border-strong)] shadow-[0_20px_50px_-24px_rgb(26_29_18_/_0.3)]"
            />
          </div>
        </div>
      </section>

      {/* ── Extension ────────────────────────────────────────────────── */}
      <section id="extension" className="border-b border-[var(--border)] bg-[var(--bg)] py-24 sm:py-32">
        <div className="mx-auto grid w-full max-w-[82rem] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
              {/* A toolbar, not an abstract icon — this is where the
                  extension actually lives. */}
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 shadow-[0_1px_2px_rgb(26_29_18_/_0.06)]">
                <div className="flex shrink-0 gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <div className="min-w-0 flex-1 truncate rounded-md bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--ink-faint)]">
                  app.example.com/checkout
                </div>
                <WeevilLogo size={26} />
              </div>
              <p className="mt-4 text-center text-xs text-[var(--ink-faint)]">
                Click the icon, hit start — that&rsquo;s the whole setup.
              </p>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.02em] text-[var(--ink)]" style={{ textWrap: 'balance' }}>
              Lives in your browser. Starts with one click.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--ink-muted)]">
              The Weevil extension sits quietly in your toolbar until you need it. Hit start,
              reproduce the bug, hit stop — review everything before it uploads.
            </p>
            <ul className="mt-8 space-y-4">
              {PRIVACY_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" aria-hidden />
                  <span className="text-sm leading-6 text-[var(--ink-muted)]">{point}</span>
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-9">
              <Link href="/signup">Get started</Link>
            </Button>
            <p className="mt-3 text-xs text-[var(--ink-faint)]">
              The extension installs from your dashboard right after you sign up.
            </p>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      <section id="cta" className="bg-[var(--primary)] py-20 sm:py-28">
        <div className="mx-auto flex w-full max-w-[82rem] flex-col items-center gap-6 px-4 text-center sm:px-6">
          <WeevilMark size={40} tone="on-primary" />
          <h2 className="max-w-xl text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.02em] text-white" style={{ textWrap: 'balance' }}>
            Next bug, minus the guesswork.
          </h2>
          <Button asChild size="lg" className="bg-white text-[var(--primary)] hover:bg-white/90">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
