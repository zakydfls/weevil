import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { WeevilMark } from '@/components/brand/weevil-mark';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What the Weevil Chrome extension and web app collect, what they redact automatically, and how you stay in control of bug recording data.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Weevil Privacy Policy',
    description:
      'What the Weevil Chrome extension and web app collect, what they redact automatically, and how you stay in control of bug recording data.',
    url: '/privacy',
    type: 'website',
  },
};

const SUPPORT_EMAIL = 'centurycode23@gmail.com';
const LAST_UPDATED = 'July 6, 2026';

const SUMMARY_POINTS = [
  'Weevil only records while you’ve started an active capture — never silently, never in the background.',
  'Header secrets (auth tokens, cookies, API keys) and password field values are redacted automatically. Password redaction can’t be turned off.',
  'You review every capture before it uploads. Discard it and nothing leaves your device.',
  'We don’t sell your data, run ads, or share captures with third parties. The extension has no third-party analytics or tracking SDK.',
  'No remote code — everything the extension runs ships inside the reviewed extension package.',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-7 text-[var(--ink-muted)]">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[52rem] px-4 py-20 sm:px-6 sm:py-28">
      <div className="text-center">
        <WeevilMark size={48} tone="primary" className="mx-auto weevil-mascot" />
        <h1 className="mt-6 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold tracking-[-0.02em] text-[var(--ink)]">
          Privacy policy
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--ink-muted)]">Last updated {LAST_UPDATED}</p>
      </div>

      <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--primary-subtle)] text-[var(--primary)]">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="text-base font-semibold text-[var(--ink)]">The short version</h2>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--ink-muted)]">
          {SUMMARY_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="text-xs leading-6 text-[var(--ink-faint)]">
          The rest of this page covers the details — what exactly gets captured, what is and isn’t redacted, and how
          to reach us.
        </p>
      </div>

      <div className="mx-auto mt-14 max-w-[70ch] space-y-10">
        <Section title="What Weevil is">
          <p>
            Weevil is a Chrome extension and web app for capturing bug reports — combining screen recording, console
            logs, network activity, and user actions into one shareable timeline, so a team can reproduce an issue
            without back-and-forth. This policy explains what the extension and web app collect, what&rsquo;s
            protected automatically, and how you can control it.
          </p>
        </Section>

        <Section title="When we collect data">
          <p>
            Capture data is only collected while a recording is active — something you start and stop yourself from
            the extension popup, with a visible recording indicator on screen the whole time. Weevil never records in
            the background or before you click start.
          </p>
          <p>
            Separately, when you sign up and use the dashboard, we collect ordinary account data — your email and
            workspace membership. That&rsquo;s account data, not capture content, and it&rsquo;s handled the same way
            any web app handles a signup.
          </p>
        </Section>

        <Section title="What a capture includes">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Screen recording and screenshots of the tab you chose to capture.</li>
            <li>Console logs and runtime errors, including the logged arguments (each truncated after roughly 2,000 characters).</li>
            <li>
              Network requests and responses — headers, and text-based bodies (JSON, HTML, and similar) up to
              roughly 20,000 characters each. Binary bodies such as images and fonts aren&rsquo;t read.
            </li>
            <li>User actions: clicks, key presses, scrolling, and navigation, including values typed into form fields.</li>
            <li>Page context: URL, page title, and basic performance/timing metrics.</li>
          </ul>
        </Section>

        <Section title="What’s redacted automatically">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-[var(--ink)]">Header secrets.</span>{' '}
              Authorization, Cookie, and similarly named headers (tokens, API keys, session identifiers) are
              redacted by default. This can be adjusted from the extension&rsquo;s options page if you need to.
            </li>
            <li>
              <span className="font-medium text-[var(--ink)]">Password fields.</span>{' '}
              The value typed into a password field — or a field marked as a password, card, or one-time-code
              field — is replaced with{' '}
              <code className="rounded bg-[var(--primary-subtle)] px-1 py-0.5 text-xs">[redacted]</code>{' '}
              before it&rsquo;s recorded, for both the field&rsquo;s value and every keystroke typed into it. This
              protection always runs and can&rsquo;t be turned off.
            </li>
          </ul>
        </Section>

        <Section title="What isn’t redacted automatically">
          <p>
            Other typed text, console output, and network request/response bodies are captured as they appear on the
            page, because Weevil has no way to know which of those might be sensitive without reading them. If a page
            you&rsquo;re capturing displays or logs personal information outside of a password field — an email
            address in a support ticket, for example — that content will show up in the capture the same way it
            appears on the page.
          </p>
          <p>
            If you&rsquo;re about to capture a page with sensitive personal, financial, or health data you
            don&rsquo;t want recorded, the safest option is not to start a capture on it. If you do and change your
            mind, see the next section — nothing uploads until you say so.
          </p>
        </Section>

        <Section title="You’re in control before anything uploads">
          <p>
            After you stop a capture, you review it locally before it&rsquo;s sent anywhere. Discard it and nothing
            leaves your device. Uploading is a separate, explicit action you take afterward.
          </p>
        </Section>

        <Section title="Where your data goes">
          <p>
            Uploaded captures are stored on Weevil&rsquo;s servers and associated with the workspace you uploaded
            them to. Only members of that workspace, per their role and permissions, can view a capture. We
            don&rsquo;t sell capture data, use it for advertising, or share it with third parties outside of
            operating the product. The extension doesn&rsquo;t include any third-party analytics or tracking SDK.
          </p>
        </Section>

        <Section title="Deleting your data">
          <p>
            You can delete a capture from your dashboard at any time, which removes it from your workspace
            immediately. If you need a capture permanently erased from our storage — for compliance reasons, for
            example — email us at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[var(--ink)]">
              {SUPPORT_EMAIL}
            </a>{' '}
            and we&rsquo;ll take care of it directly.
          </p>
        </Section>

        <Section title="No remote code">
          <p>
            Every script the extension runs is bundled inside the extension package you install from the Chrome Web
            Store and reviewed by Google as part of that listing. Weevil doesn&rsquo;t fetch or execute code from an
            external server at runtime.
          </p>
        </Section>

        <Section title="Location and IP address">
          <p>
            The extension itself doesn&rsquo;t access your device&rsquo;s precise location and doesn&rsquo;t collect
            your IP address as part of a capture. Our servers may log IP addresses in standard request logs for
            security and abuse prevention, as most web services do.
          </p>
        </Section>

        <Section title="Children’s privacy">
          <p>
            Weevil is a developer tool built for engineering teams and isn&rsquo;t directed at children. We
            don&rsquo;t knowingly collect data from anyone under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we make a meaningful change to how Weevil handles data, we&rsquo;ll update this page and its
            &ldquo;last updated&rdquo; date above.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or your data? Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[var(--ink)]">
              {SUPPORT_EMAIL}
            </a>{' '}
            — the same inbox as support.
          </p>
        </Section>
      </div>
    </div>
  );
}
