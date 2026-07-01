'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/features/auth/auth-shell';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api/client';
import { appEnv, readPublicEnv } from '@/lib/env';

const devSeedEmail = appEnv.canShowDevOnlyUi
  ? readPublicEnv(process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL)
  : '';
const devSeedPassword = appEnv.canShowDevOnlyUi
  ? readPublicEnv(process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD)
  : '';
const showDevSeedHint = Boolean(devSeedEmail && devSeedPassword);

export default function LoginPage() {
  const auth = useAuth();
  const [inviteToken, setInviteToken] = useState('');
  const signupHref = inviteToken
    ? `/signup?inviteToken=${encodeURIComponent(inviteToken)}`
    : '/signup';
  const [email, setEmail] = useState(devSeedEmail);
  const [password, setPassword] = useState(devSeedPassword);
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'checking' | 'redirecting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = submitPhase !== 'idle';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('inviteToken') ?? params.get('invite') ?? '');
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitPhase('checking');
    setError(null);
    try {
      await auth.login(email.trim(), password, inviteToken ? { inviteToken } : undefined);
      setSubmitPhase('redirecting');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      setError(err instanceof ApiError && err.status === 401 ? 'Invalid email or password.' : message);
      setSubmitPhase('idle');
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={
        <span>
          New to Weevil?{' '}
          <Link href={signupHref} className="font-medium text-[var(--primary)] hover:underline">
            Create an account
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)] font-mono"
          >
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)] font-mono"
          >
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
        {error ? (
          <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitPhase === 'checking'
            ? 'Checking credentials'
            : submitPhase === 'redirecting'
              ? 'Opening dashboard'
              : 'Sign in'}
        </Button>
        {isSubmitting ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]"
          >
            {submitPhase === 'redirecting'
              ? 'Workspace loaded. Redirecting...'
              : 'Securing your workspace session...'}
          </div>
        ) : null}
        {showDevSeedHint ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            dev login:{' '}
            <span className="normal-case tracking-normal text-[var(--ink-muted)]">
              {devSeedEmail} / {devSeedPassword}
            </span>
          </div>
        ) : null}
      </form>
    </AuthShell>
  );
}
