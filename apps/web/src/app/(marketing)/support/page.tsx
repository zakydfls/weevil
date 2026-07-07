import type { Metadata } from 'next';
import { Mail } from 'lucide-react';
import { WeevilMark } from '@/components/brand/weevil-mark';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Support and FAQ',
  description:
    'Get help with Weevil, the Chrome bug recorder for screen recordings, console logs, network requests, and shareable debugging sessions.',
  alternates: {
    canonical: '/support',
  },
  openGraph: {
    title: 'Weevil Support and FAQ',
    description:
      'Get help with Weevil, the Chrome bug recorder for screen recordings, console logs, network requests, and shareable debugging sessions.',
    url: '/support',
    type: 'website',
  },
};

const SUPPORT_EMAIL = 'centurycode23@gmail.com';

const FAQS = [
  {
    question: 'Does Weevil record everything I do, all the time?',
    answer:
      'No. Weevil only records while you’ve started an active capture — never silently, never in the background. You choose exactly when it starts and stops.',
  },
  {
    question: 'What does a single capture actually include?',
    answer:
      'Screen recording and screenshots of the tab you chose to capture, console logs and runtime errors, network requests and responses, clicks/keystrokes/navigation, and basic page and performance metadata — all synced to one timeline.',
  },
  {
    question: 'Is sensitive data like auth tokens, cookies, or passwords captured?',
    answer:
      'Sensitive header values (auth tokens, cookies, API keys) are redacted by default, and password field values are always redacted — that one can’t be turned off. Other typed text, console output, and network bodies are captured as they appear on the page. See our privacy policy for the full breakdown.',
  },
  {
    question: 'What browsers does Weevil support?',
    answer: 'Chrome today, via our Manifest V3 extension. It works on any site, including localhost.',
  },
  {
    question: 'How do I install the extension?',
    answer:
      'Sign up for a workspace, then install the extension from your dashboard — it walks you through the rest.',
  },
  {
    question: 'I found a bug in Weevil. (The irony isn’t lost on us.)',
    answer: `Email us at ${SUPPORT_EMAIL} — or, better yet, record it with Weevil and send us the link.`,
  },
];

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-[52rem] px-4 py-20 sm:px-6 sm:py-28">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <div className="text-center">
        <WeevilMark size={48} tone="primary" className="mx-auto weevil-mascot" />
        <h1 className="mt-6 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold tracking-[-0.02em] text-[var(--ink)]">
          We&rsquo;re here if something&rsquo;s stuck.
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--ink-muted)]">
          Questions about a capture, your workspace, or the extension — one email away.
        </p>
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center sm:p-10">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--primary-subtle)] text-[var(--primary)]">
          <Mail className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm text-[var(--ink-muted)]">We usually reply within a business day.</p>
        <Button asChild size="lg">
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </Button>
      </div>

      <div className="mt-20">
        <h2 className="text-xl font-semibold text-[var(--ink)]">Frequently asked</h2>
        <dl className="mt-6 divide-y divide-[var(--divider)] border-t border-[var(--divider)]">
          {FAQS.map((faq) => (
            <div key={faq.question} className="py-6">
              <dt className="text-base font-semibold text-[var(--ink)]">{faq.question}</dt>
              <dd className="mt-2 max-w-[65ch] text-sm leading-6 text-[var(--ink-muted)]">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
