'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/features/auth/auth-shell';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, apiClient } from '@/lib/api/client';
import { appEnv, readPublicEnv } from '@/lib/env';

const devSeedEmail = appEnv.canShowDevOnlyUi
  ? readPublicEnv(process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL)
  : '';
const devSeedPassword = appEnv.canShowDevOnlyUi
  ? readPublicEnv(process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD)
  : '';
const showDevSeedHint = Boolean(devSeedEmail && devSeedPassword);

interface InvitePreview {
  email: string;
  role: string;
  expiresAt: string;
  workspace: { slug: string; name: string };
  invitedBy: { email: string; displayName: string | null } | null;
}

export default function LoginPage() {
  const auth = useAuth();
  const [inviteToken, setInviteToken] = useState('');
  const [nextPath, setNextPath] = useState('');
  const [email, setEmail] = useState(devSeedEmail);
  const [password, setPassword] = useState(devSeedPassword);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'checking' | 'redirecting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = submitPhase !== 'idle';
  const signupHref = buildAuthHref('/signup', { inviteToken, next: nextPath });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('inviteToken') ?? params.get('invite') ?? '');
    setNextPath(safeNextPath(params.get('next')));
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setInvitePreview(null);
      setInviteError('');
      setIsInviteLoading(false);
      return;
    }

    let isActive = true;
    setIsInviteLoading(true);
    setInviteError('');
    void apiClient
      .getInvitePreview(inviteToken)
      .then((preview) => {
        if (!isActive) return;
        setInvitePreview(preview);
        setEmail(preview.email);
      })
      .catch(() => {
        if (!isActive) return;
        setInvitePreview(null);
        setInviteError('This invite link is invalid or expired.');
      })
      .finally(() => {
        if (isActive) setIsInviteLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [inviteToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitPhase('checking');
    setError(null);
    try {
      await auth.login(email.trim(), password, {
        ...(inviteToken ? { inviteToken } : {}),
        ...(nextPath ? { redirectTo: nextPath } : {}),
      });
      setSubmitPhase('redirecting');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      setError(err instanceof ApiError && err.status === 401 ? 'Invalid email or password.' : message);
      setSubmitPhase('idle');
    }
  }

  return (
    <AuthShell
      title={invitePreview ? `Join ${invitePreview.workspace.name}` : 'Welcome back'}
      subtitle={
        invitePreview
          ? `Sign in as ${invitePreview.email} to accept this invitation.`
          : inviteToken
            ? 'Sign in to accept your workspace invitation.'
            : 'Sign in to your workspace.'
      }
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
            disabled={isSubmitting || Boolean(invitePreview)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        {inviteToken ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
            {isInviteLoading ? (
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Loading invite
              </div>
            ) : invitePreview ? (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-[var(--ink)]">
                  {invitePreview.workspace.name}
                </div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                  {invitePreview.role.toLowerCase()} access
                </div>
              </div>
            ) : (
              <div className="text-xs font-medium text-[var(--danger)]">
                {inviteError || 'Invite unavailable.'}
              </div>
            )}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)] font-mono"
          >
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              type={isPasswordVisible ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setIsPasswordVisible((current) => !current)}
              disabled={isSubmitting}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--primary-subtle)] hover:text-[var(--ink)] disabled:pointer-events-none disabled:opacity-50"
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            >
              {isPasswordVisible ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
        {error ? (
          <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        <Button type="submit" className="h-10 w-full" disabled={isSubmitting || Boolean(inviteError)}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitPhase === 'checking'
            ? 'Checking credentials'
            : submitPhase === 'redirecting'
              ? 'Opening dashboard'
              : inviteToken
                ? 'Sign in and join'
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

function buildAuthHref(
  pathname: string,
  params: { inviteToken?: string; next?: string },
): string {
  const searchParams = new URLSearchParams();
  if (params.inviteToken) searchParams.set('inviteToken', params.inviteToken);
  if (params.next) searchParams.set('next', params.next);
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '';
  }
  return value;
}
