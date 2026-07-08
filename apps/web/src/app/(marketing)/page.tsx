import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Code2,
  GitBranch,
  Network,
  ShieldCheck,
  TimerReset,
  UserRoundCheck,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { WeevilMark } from '@/components/brand/weevil-mark';
import { Button } from '@/components/ui/button';

const SITE_URL = 'https://theweevil.space';
const LANDING_DESCRIPTION =
  'Weevil is an all-in-one bug recorder and triage workspace for web teams. Capture screen recordings, console logs, network requests, runtime errors, user actions, board states, assignees, and notifications in one debugging workflow.';

export const metadata: Metadata = {
  title: {
    absolute: 'Weevil — bug recorder, triage board, and assignment workflow',
  },
  description: LANDING_DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Weevil — bug recorder, triage board, and assignment workflow',
    description: LANDING_DESCRIPTION,
    url: '/',
    type: 'website',
    images: [
      {
        url: '/marketing/panel-network.png',
        width: 1840,
        height: 1054,
        alt: 'Weevil capture detail view showing network requests synced to a bug recording timeline',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Weevil — bug recorder, triage board, and assignment workflow',
    description: LANDING_DESCRIPTION,
    images: ['/marketing/panel-network.png'],
  },
};

const VIEW_REDIRECTS: Record<string, string> = {
  captures: '/captures',
  inbox: '/captures',
  'project-board': '/board',
  board: '/board',
  settings: '/settings',
  platform: '/platform',
};

const HERO_PROOFS = [
  'Recorder',
  'Console',
  'Network',
  'Runtime errors',
  'Actions',
  'Board',
  'Assignees',
  'Notifications',
];

const HERO_EVENTS = [
  { time: '00:03', type: 'ACT', label: 'Clicked submit on QA detail' },
  { time: '00:05', type: 'NET', label: 'POST /api/documents -> 500' },
  { time: '00:06', type: 'ERR', label: 'Unhandled rejection captured' },
  { time: '00:08', type: 'ASN', label: 'Assigned to QA + frontend' },
];

const HERO_REQUESTS = [
  { method: 'GET', path: '/qa/detail', status: '200', tone: 'text-[var(--success)]' },
  { method: 'POST', path: '/api/documents', status: '500', tone: 'text-[var(--danger)]' },
  { method: 'PATCH', path: '/captures/state', status: '204', tone: 'text-[var(--success)]' },
];

const PAIN_POINTS = [
  {
    title: 'Two vendors for one bug?',
    body: 'A recorder here, a board there, and a subscription receipt that looks like a ransom note. Bold strategy.',
  },
  {
    title: 'Reports that still need an interrogation?',
    body: 'If engineers still ask "what happened before this?", that is not a report. That is homework with attachments.',
  },
  {
    title: 'Assignments lost in chat?',
    body: 'A Slack mention is not ownership. It is confetti with a timestamp.',
  },
];

const WORKFLOW = [
  {
    icon: Video,
    title: 'Record the actual mess',
    body: 'Screen, clicks, console, runtime errors, and request data are captured together while the bug is reproduced.',
  },
  {
    icon: Network,
    title: 'Inspect the evidence',
    body: 'Scrub the recording and see network, console, and actions move with the same clock. No dramatic guessing.',
  },
  {
    icon: ClipboardList,
    title: 'Drop it onto the board',
    body: 'Backlog, in progress, review, done, or your own custom state. The capture becomes work, not a lonely link.',
  },
  {
    icon: UserRoundCheck,
    title: 'Assign the cleanup crew',
    body: 'Multiple assignees, visible avatars, and email notification preferences. Ownership finally has a pulse.',
  },
];

const CAPABILITIES = [
  {
    icon: TimerReset,
    title: 'Timeline-first debugging',
    body: 'Every signal is timestamped. Click a failure, jump to the frame. Cute little miracle, except it is just engineering.',
  },
  {
    icon: Code2,
    title: 'Console and runtime errors',
    body: 'Warnings, logs, thrown errors, stack traces, and rejection details arrive with the recording instead of three screenshots later.',
  },
  {
    icon: GitBranch,
    title: 'Bug board included',
    body: 'Stop paying for a capture tool and then paying again to remember who should fix the thing.',
  },
  {
    icon: BellRing,
    title: 'Assignee notifications',
    body: 'Developers get notified when they are assigned, assuming they opted in. Polite, useful, and not another noisy ritual.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy controls',
    body: 'Captures are intentional, reviewable, and sensitive values are redacted by default. Spicy does not mean reckless.',
  },
  {
    icon: CheckCircle2,
    title: 'One shareable truth',
    body: 'Send one link. The video, logs, requests, comments, assignees, and board context all travel together.',
  },
];

const BOARD_COLUMNS = [
  { title: 'Backlog', count: 9, tone: 'bg-[var(--accent-cool)]' },
  { title: 'In progress', count: 3, tone: 'bg-[var(--primary)]' },
  { title: 'Review', count: 2, tone: 'bg-[var(--warning)]' },
  { title: 'Done', count: 12, tone: 'bg-[var(--success)]' },
];

const PRIVACY_POINTS = [
  'Records only when a capture is active. No mystery surveillance subplot.',
  'Sensitive values like cookies and authorization headers are redacted by default.',
  'Teams can review, assign, comment, and share without scattering evidence across five tabs.',
];

const LANDING_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Weevil',
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      email: 'centurycode23@gmail.com',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Weevil',
      url: SITE_URL,
      description: LANDING_DESCRIPTION,
      inLanguage: 'en',
      publisher: {
        '@id': `${SITE_URL}/#organization`,
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'Weevil',
      url: SITE_URL,
      description: LANDING_DESCRIPTION,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Chrome, Web',
      screenshot: `${SITE_URL}/marketing/panel-network.png`,
      publisher: {
        '@id': `${SITE_URL}/#organization`,
      },
      featureList: [
        'Bug report screen recording',
        'Console log and runtime error capture',
        'Network request and response capture',
        'User action timeline',
        'Kanban-style bug management board',
        'Multiple assignees per capture',
        'Assignee email notifications',
        'Shareable debugging session links',
      ],
    },
  ],
};

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(LANDING_JSON_LD) }}
      />

      <section id="hero" className="group/hero relative isolate overflow-hidden bg-[var(--ink-strong)] text-white">
        <div
          className="weevil-hero-slab absolute bottom-0 right-[-10vw] top-0 -z-20 hidden w-[58vw] skew-x-[-9deg] bg-[var(--primary)] lg:block"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 -z-20 h-[22%] bg-[var(--primary)] lg:h-[18%]"
          aria-hidden
        />
        <HeroEvidenceScene />

        <div className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-[86rem] flex-col justify-center px-4 py-16 sm:px-6 lg:py-24">
          <div className="relative z-10 max-w-3xl">
            <p
              className="weevil-hero-enter inline-flex rounded-md border border-white/20 bg-white/[0.08] px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] text-white/78"
              style={{ '--i': 0 } as CSSProperties}
            >
              Recorder. Board. Assignees. Not three subscriptions.
            </p>
            <h1
              className="weevil-hero-enter mt-6 max-w-3xl text-[clamp(3rem,7vw,5.9rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-white"
              style={{ '--i': 1 } as CSSProperties}
            >
              Bug reports that arrive with receipts.
            </h1>
            <p
              className="weevil-hero-enter mt-6 max-w-2xl text-lg leading-8 text-white/80 sm:text-xl sm:leading-9"
              style={{ '--i': 2 } as CSSProperties}
            >
              Weevil records the screen, catches the network tantrum, pins the owner,
              and keeps the board moving. One workflow. Fewer invoices. Less theater.
            </p>
            <div
              className="weevil-hero-enter mt-9 flex flex-wrap items-center gap-3"
              style={{ '--i': 3 } as CSSProperties}
            >
              <Button asChild size="lg" className="weevil-button-pop bg-white text-[var(--primary)] hover:bg-white/90">
                <Link href="/signup">
                  Start recording
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="weevil-button-pop border border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#workflow">See the workflow</a>
              </Button>
            </div>
          </div>

          <div className="relative z-10 mt-10 lg:hidden">
            <HeroCompactEvidenceCard />
          </div>

          <div className="relative z-10 mt-14 flex max-w-3xl flex-wrap gap-2 pb-8 sm:pb-10 lg:mt-32 lg:pb-12">
            {HERO_PROOFS.map((proof, index) => (
              <span
                key={proof}
                className="weevil-proof-chip rounded-md border border-white/[0.16] bg-white/[0.08] px-2.5 py-1 font-mono text-[11px] text-white/80"
                style={{ '--i': index } as CSSProperties}
              >
                {proof}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="weevil-section-reveal border-b border-[var(--border)] bg-[var(--bg)] py-20 sm:py-24">
        <div className="mx-auto grid w-full max-w-[86rem] gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
          <div>
            <h2 className="max-w-2xl text-[clamp(2rem,4vw,3.5rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
              The expensive two-tool ceremony is over.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--ink-muted)]">
              Bug management should not feel like a group project between your wallet,
              your recorder, your board, and whatever chat thread everyone forgot.
            </p>
          </div>
          <div className="grid gap-3">
            {PAIN_POINTS.map((point, index) => (
              <article
                key={point.title}
                className="weevil-feature-card rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5"
                style={{ '--i': index } as CSSProperties}
              >
                <h3 className="text-lg font-semibold text-[var(--ink)]">{point.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{point.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="weevil-section-reveal border-b border-[var(--border)] bg-[var(--surface)] py-20 sm:py-28">
        <div className="mx-auto w-full max-w-[86rem] px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end">
            <div>
              <h2 className="max-w-2xl text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                One capture becomes something engineers can actually fix.
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-[var(--ink-muted)] lg:justify-self-end">
              Weevil does the boring connective tissue for you: capture evidence, inspect it,
              move it through a board, assign the right people, and keep everyone pointed at
              the same artifact.
            </p>
          </div>

          <div className="weevil-workflow-track mt-14 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {WORKFLOW.map((item, index) => (
              <FeatureBlock key={item.title} index={index} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section id="debugging" className="weevil-section-reveal border-b border-[var(--border)] bg-[var(--bg)] py-20 sm:py-28">
        <div className="mx-auto grid w-full max-w-[86rem] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div className="weevil-debug-frame overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--ink-strong)]">
            <Image
              src="/marketing/panel-console.png"
              alt="Weevil capture detail showing console errors and runtime context synced with a recording"
              width={1840}
              height={1560}
              loading="lazy"
              className="h-auto w-full"
            />
          </div>
          <div>
            <h2 className="max-w-xl text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
              A replayable crime scene for frontend bugs.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--ink-muted)]">
              Screen recording alone is theater. Logs alone are archaeology. Weevil puts
              the video, console, actions, requests, and errors on one timeline so the
              failure stops hiding behind vibes.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {CAPABILITIES.slice(0, 4).map((item, index) => (
                <MiniCapability key={item.title} index={index} {...item} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="board" className="weevil-section-reveal border-b border-[var(--border)] bg-[var(--surface-cool)] py-20 sm:py-28">
        <div className="mx-auto grid w-full max-w-[86rem] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
          <div>
            <h2 className="max-w-xl text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
              The bug does not vanish after the recording.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--ink-muted)]">
              It lands on a board, gets a state, picks up assignees, and sends notifications
              only when the developer actually wants them. Wild concept: ownership.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {CAPABILITIES.slice(4).map((item, index) => (
                <MiniCapability key={item.title} index={index} {...item} />
              ))}
            </div>
          </div>

          <div className="weevil-board-panel rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-2 pb-3">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Board</p>
                <p className="text-xs text-[var(--ink-muted)]">Captures become accountable work.</p>
              </div>
              <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[11px] text-[var(--ink-muted)]">
                26 captures
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              {BOARD_COLUMNS.map((column, columnIndex) => (
                <div
                  key={column.title}
                  className="weevil-board-column min-h-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2"
                  style={{ '--i': columnIndex } as CSSProperties}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-7 w-7 rounded-lg ${column.tone}`} aria-hidden />
                      <span className="truncate text-xs font-semibold text-[var(--ink)]">{column.title}</span>
                    </div>
                    <span className="font-mono text-xs text-[var(--ink-muted)]">{column.count}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {Array.from({ length: Math.min(3, column.count) }).map((_, index) => (
                      <div
                        key={`${column.title}-${index}`}
                        className="weevil-board-card rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2"
                        style={{ '--i': index } as CSSProperties}
                      >
                        <div className="h-2 w-4/5 rounded bg-[var(--surface-deep)]" />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex -space-x-1">
                            <span className="h-5 w-5 rounded-full border border-[var(--bg)] bg-[var(--primary-subtle)]" />
                            <span className="h-5 w-5 rounded-full border border-[var(--bg)] bg-[var(--success-bg)]" />
                          </div>
                          <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-faint)]">
                            assigned
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="extension" className="weevil-section-reveal border-b border-[var(--border)] bg-[var(--bg)] py-20 sm:py-28">
        <div className="mx-auto grid w-full max-w-[86rem] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div className="weevil-extension-shell rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2">
              <div className="flex shrink-0 gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="min-w-0 flex-1 truncate rounded-md bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--ink-faint)]">
                app.example.com/checkout
              </div>
              <span className="weevil-extension-live relative inline-grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary-subtle)]">
                <WeevilMark size={24} tone="primary" />
              </span>
            </div>
            <div className="weevil-extension-card mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
              <p className="text-sm font-semibold text-[var(--ink)]">One click. Reproduce. Stop.</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                The Chrome extension records only while you ask it to. No spooky background
                nonsense, no detective novel permission model.
              </p>
            </div>
          </div>

          <div>
            <h2 className="max-w-2xl text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
              Calm enough for QA. Detailed enough for the engineer who got paged.
            </h2>
            <ul className="mt-8 space-y-4">
              {PRIVACY_POINTS.map((point, index) => (
                <li
                  key={point}
                  className="weevil-privacy-row flex items-start gap-3"
                  style={{ '--i': index } as CSSProperties}
                >
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" aria-hidden />
                  <span className="text-sm leading-6 text-[var(--ink-muted)]">{point}</span>
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="weevil-button-pop mt-9">
              <Link href="/signup">
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="cta" className="weevil-section-reveal relative isolate overflow-hidden bg-[var(--primary)] py-20 text-white sm:py-28">
        <div className="weevil-cta-orbit absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" aria-hidden />
        <div className="mx-auto flex w-full max-w-[86rem] flex-col items-center gap-6 px-4 text-center sm:px-6">
          <WeevilMark size={44} tone="on-primary" />
          <h2 className="max-w-3xl text-[clamp(2rem,4vw,3.5rem)] font-semibold tracking-[-0.03em] text-white">
            Your next bug report can be evidence, ownership, and momentum.
          </h2>
          <p className="max-w-xl text-base leading-7 text-white/80">
            Or it can be another blurry recording link in chat, bravely pretending to be a workflow.
            We did build the better option.
          </p>
          <Button asChild size="lg" className="weevil-button-pop bg-white text-[var(--primary)] hover:bg-white/90">
            <Link href="/signup">Start with Weevil</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function HeroEvidenceScene() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden lg:block"
      aria-hidden
    >
      <div className="weevil-timeline-rail absolute bottom-5 left-4 right-4 z-0 h-16 rounded-xl border border-white/15 bg-white/[0.06] sm:left-6 sm:right-6 lg:bottom-6 lg:left-[max(1.5rem,calc((100vw-86rem)/2))] lg:right-[max(1.5rem,calc((100vw-86rem)/2))]">
        <div className="absolute left-[18%] top-0 h-full w-px bg-white/25" />
        <div className="absolute left-[44%] top-0 h-full w-px bg-white/25" />
        <div className="absolute left-[72%] top-0 h-full w-px bg-white/25" />
        <div className="weevil-hero-scrubber absolute left-[44%] top-[-0.35rem] h-[calc(100%+0.7rem)] w-1 rounded-full bg-white" />
      </div>

      <div className="weevil-evidence-card absolute bottom-28 right-4 z-10 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/20 bg-[var(--surface-elevated)] text-[var(--ink)] sm:right-6 lg:bottom-24 lg:right-[max(1.5rem,calc((100vw-86rem)/2))] lg:w-[36rem]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">capture #A7F4</span>
        </div>

        <div className="grid gap-px bg-[var(--border)] md:grid-cols-[0.92fr_1.08fr]">
          <div className="bg-[var(--ink-strong)] p-4 text-white">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-white/55">REPLAY</span>
              <span className="rounded bg-white/10 px-2 py-1 font-mono text-[10px] text-white/70">
                00:08 / 00:31
              </span>
            </div>
            <div className="weevil-replay-window mt-6 aspect-video rounded-lg border border-white/15 bg-white/[0.08] p-3">
              <div className="h-full rounded-md border border-white/10 bg-[var(--primary)]/25 p-3">
                <div className="h-3 w-2/3 rounded bg-white/45" />
                <div className="mt-3 h-16 rounded border border-white/15 bg-white/10" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <span className="h-8 rounded bg-white/16" />
                  <span className="h-8 rounded bg-white/16" />
                  <span className="h-8 rounded bg-white/16" />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[10px] text-white/70">
              <span className="rounded border border-white/12 bg-white/[0.07] px-2 py-1">34 NET</span>
              <span className="rounded border border-white/12 bg-white/[0.07] px-2 py-1">7 ACT</span>
              <span className="rounded border border-white/12 bg-white/[0.07] px-2 py-1">2 ERR</span>
            </div>
          </div>

          <div className="bg-[var(--surface-elevated)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Checkout upload fails</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Network, action, error, and owner in one packet.</p>
              </div>
              <span className="rounded-md bg-[var(--primary-subtle)] px-2 py-1 font-mono text-[10px] text-[var(--primary)]">
                In progress
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {HERO_REQUESTS.map((request, index) => (
                <div
                  key={`${request.method}-${request.path}`}
                  className="weevil-request-row flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[10px]"
                  style={{ '--i': index } as CSSProperties}
                >
                  <span className="w-9 text-[var(--ink-faint)]">{request.method}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{request.path}</span>
                  <span className={request.tone}>{request.status}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">ASSIGNED</span>
                <div className="flex -space-x-1.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--surface)] bg-[var(--primary-soft)] text-[10px] font-semibold text-[var(--primary)]">
                    ZA
                  </span>
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--surface)] bg-[var(--success-bg)] text-[10px] font-semibold text-[var(--success)]">
                    FE
                  </span>
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--surface)] bg-[var(--surface-deep)] text-[10px] font-semibold text-[var(--ink-muted)]">
                    QA
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="weevil-timeline-card absolute right-6 top-16 hidden w-[23rem] rounded-2xl border border-white/18 bg-[var(--ink-strong)] text-white lg:block xl:right-[calc(max(1.5rem,(100vw-86rem)/2)+29rem)]">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold">Evidence timeline</p>
        </div>
        <div className="space-y-3 p-4">
          {HERO_EVENTS.map((event, index) => (
            <div
              key={`${event.time}-${event.type}`}
              className="weevil-event-row grid grid-cols-[3.2rem_2.5rem_1fr] items-center gap-2"
              style={{ '--i': index } as CSSProperties}
            >
              <span className="font-mono text-[10px] text-white/45">{event.time}</span>
              <span className="rounded bg-white/10 px-1.5 py-1 text-center font-mono text-[10px] text-white/70">
                {event.type}
              </span>
              <span className="truncate text-xs text-white/78">{event.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroCompactEvidenceCard() {
  return (
    <div className="weevil-evidence-card overflow-hidden rounded-2xl border border-white/18 bg-[var(--surface-elevated)] text-[var(--ink)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="font-mono text-[10px] text-[var(--ink-faint)]">capture #A7F4</span>
      </div>
      <div className="bg-[var(--ink-strong)] p-4 text-white">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-white/55">REPLAY</span>
          <span className="rounded bg-white/10 px-2 py-1 font-mono text-[10px] text-white/70">
            00:08 / 00:31
          </span>
        </div>
        <div className="weevil-replay-window mt-4 aspect-[16/9] rounded-lg border border-white/15 bg-white/[0.08] p-3">
          <div className="h-full rounded-md border border-white/10 bg-[var(--primary)]/25 p-3">
            <div className="h-3 w-2/3 rounded bg-white/45" />
            <div className="mt-3 h-14 rounded border border-white/15 bg-white/10" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <span className="h-7 rounded bg-white/16" />
              <span className="h-7 rounded bg-white/16" />
              <span className="h-7 rounded bg-white/16" />
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] text-white/70">
          <span className="rounded border border-white/12 bg-white/[0.07] px-2 py-1">34 NET</span>
          <span className="rounded border border-white/12 bg-white/[0.07] px-2 py-1">7 ACT</span>
          <span className="rounded border border-white/12 bg-white/[0.07] px-2 py-1">2 ERR</span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Checkout upload fails</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
              Evidence, board state, and owners already attached.
            </p>
          </div>
          <span className="rounded-md bg-[var(--primary-subtle)] px-2 py-1 font-mono text-[10px] text-[var(--primary)]">
            In progress
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {HERO_REQUESTS.slice(0, 2).map((request, index) => (
            <div
              key={`mobile-${request.method}-${request.path}`}
              className="weevil-request-row flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[10px]"
              style={{ '--i': index } as CSSProperties}
            >
              <span className="w-9 text-[var(--ink-faint)]">{request.method}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{request.path}</span>
              <span className={request.tone}>{request.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureBlock({
  icon: Icon,
  title,
  body,
  index,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  index: number;
}) {
  return (
    <article
      className="weevil-feature-card rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5"
      style={{ '--i': index } as CSSProperties}
    >
      <span className="weevil-icon-chip inline-grid h-10 w-10 place-items-center rounded-lg bg-[var(--primary-subtle)]">
        <Icon className="h-5 w-5 text-[var(--primary)]" aria-hidden />
      </span>
      <h3 className="mt-5 text-lg font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{body}</p>
    </article>
  );
}

function MiniCapability({
  icon: Icon,
  title,
  body,
  index,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  index: number;
}) {
  return (
    <article
      className="weevil-mini-card rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--primary)]" aria-hidden />
        <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{body}</p>
    </article>
  );
}
