'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  Check,
  CircleCheck,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthShell } from '@/features/auth/auth-shell';
import { useAuth } from '@/features/auth/auth-context';
import { apiClient } from '@/lib/api/client';

interface InvitePreview {
  email: string;
  role: string;
  expiresAt: string;
  workspace: { slug: string; name: string };
  invitedBy: { email: string; displayName: string | null } | null;
}

interface AcceptInviteClientProps {
  inviteToken: string;
}

export function AcceptInviteClient({ inviteToken }: AcceptInviteClientProps) {
  const auth = useAuth();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [isInviteLoading, setIsInviteLoading] = useState(Boolean(inviteToken));
  const [error, setError] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const acceptAttemptedRef = useRef(false);

  const loginHref = inviteToken
    ? `/login?inviteToken=${encodeURIComponent(inviteToken)}`
    : '/login';
  const signupHref = inviteToken
    ? `/signup?inviteToken=${encodeURIComponent(inviteToken)}`
    : '/signup';

  useEffect(() => {
    acceptAttemptedRef.current = false;
    setHasJoined(false);
    setError('');

    if (!inviteToken) {
      setPreview(null);
      setIsInviteLoading(false);
      setError('This invite link is missing its token.');
      return;
    }

    let isActive = true;
    setIsInviteLoading(true);
    void apiClient
      .getInvitePreview(inviteToken)
      .then((nextPreview) => {
        if (!isActive) return;
        setPreview(nextPreview);
      })
      .catch(() => {
        if (!isActive) return;
        setPreview(null);
        setError('This invite link is invalid or expired.');
      })
      .finally(() => {
        if (isActive) setIsInviteLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [inviteToken]);

  useEffect(() => {
    if (!preview || !inviteToken || auth.status !== 'authenticated') {
      return;
    }
    if (acceptAttemptedRef.current) {
      return;
    }

    const signedInEmail = auth.user?.email.toLowerCase();
    const invitedEmail = preview.email.toLowerCase();
    if (!signedInEmail || signedInEmail !== invitedEmail) {
      return;
    }

    acceptAttemptedRef.current = true;
    setIsAccepting(true);
    setError('');
    void auth
      .acceptInvite(inviteToken)
      .then(() => {
        setHasJoined(true);
        router.replace('/');
      })
      .catch((err) => {
        acceptAttemptedRef.current = false;
        setError(err instanceof Error ? err.message : 'Could not accept this invite.');
      })
      .finally(() => setIsAccepting(false));
  }, [auth, inviteToken, preview, router]);

  const isSessionLoading = auth.status === 'loading';
  const signedInEmail = auth.user?.email ?? '';
  const invitedEmail = preview?.email ?? '';
  const isWrongUser =
    auth.status === 'authenticated' &&
    preview &&
    signedInEmail.toLowerCase() !== invitedEmail.toLowerCase();
  const canChooseAuth = auth.status === 'unauthenticated' && preview && !isInviteLoading;

  return (
    <AuthShell
      title={preview ? `Join ${preview.workspace.name}` : 'Accept invitation'}
      subtitle={inviteSubtitle({
        preview,
        isInviteLoading,
        isSessionLoading,
        isAccepting,
        hasJoined,
        isWrongUser: Boolean(isWrongUser),
      })}
      footer={
        auth.status === 'authenticated' ? (
          <span>
            Need a different account?{' '}
            <button
              type="button"
              onClick={() => void auth.logout({ redirectTo: loginHref })}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Sign out
            </button>
          </span>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <InviteCard preview={preview} isLoading={isInviteLoading} />

        {isSessionLoading || isAccepting || hasJoined ? (
          <StatusPanel
            tone={hasJoined ? 'success' : 'default'}
            icon={
              hasJoined ? (
                <CircleCheck className="h-4 w-4" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin" />
              )
            }
            title={hasJoined ? 'Workspace joined' : isAccepting ? 'Joining workspace' : 'Checking session'}
            description={
              hasJoined
                ? 'Opening the workspace now.'
                : isAccepting
                  ? 'We are adding your account and switching your workspace.'
                  : 'We are checking whether you are already signed in.'
            }
          />
        ) : null}

        {error ? (
          <StatusPanel
            tone="danger"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Invite unavailable"
            description={error}
          />
        ) : null}

        {isWrongUser ? (
          <div className="space-y-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3">
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--bg)] text-[var(--warning)] ring-1 ring-[var(--warning-border)]">
                <Mail className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--ink)]">Use the invited email</div>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
                  This invite is for <strong>{invitedEmail}</strong>, but you are signed in as{' '}
                  <strong>{signedInEmail}</strong>.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => void auth.logout({ redirectTo: loginHref })}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out and continue
            </Button>
          </div>
        ) : null}

        {canChooseAuth ? (
          <div className="grid gap-2">
            <Button type="button" className="h-10 w-full" onClick={() => router.push(loginHref)}>
              <LogIn className="h-4 w-4" aria-hidden />
              Sign in to accept
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full"
              onClick={() => router.push(signupHref)}
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              Create account
            </Button>
          </div>
        ) : null}
      </div>
    </AuthShell>
  );
}

function InviteCard({
  preview,
  isLoading,
}: {
  preview: InvitePreview | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-md bg-[var(--surface-deep)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-deep)]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-deep)]" />
          </div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--danger-bg)] text-[var(--danger)] ring-1 ring-[var(--danger-border)]">
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--ink)]">Invite not found</div>
            <div className="mt-0.5 text-sm text-[var(--ink-muted)]">Ask the workspace admin for a new link.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--primary-subtle)] text-[var(--primary)] ring-1 ring-[var(--primary-soft)]">
          <Building2 className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--ink)]">{preview.workspace.name}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            {preview.role.toLowerCase()} access
          </div>
          <div className="mt-3 grid gap-2 rounded-md bg-[var(--surface)] px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" aria-hidden />
              <span className="min-w-0 truncate text-[var(--ink)]">{preview.email}</span>
            </div>
            {preview.invitedBy ? (
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                invited by {preview.invitedBy.displayName ?? preview.invitedBy.email}
              </div>
            ) : null}
          </div>
        </div>
        <Check className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
      </div>
    </div>
  );
}

function StatusPanel({
  tone,
  icon,
  title,
  description,
}: {
  tone: 'default' | 'danger' | 'success';
  icon: ReactNode;
  title: string;
  description: string;
}) {
  const classes =
    tone === 'danger'
      ? 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]'
      : tone === 'success'
        ? 'border-[var(--border)] bg-[var(--success-bg)] text-[var(--success)]'
        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--primary)]';

  return (
    <div className={`flex gap-3 rounded-lg border p-3 ${classes}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--ink)]">{title}</div>
        <div className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{description}</div>
      </div>
    </div>
  );
}

function inviteSubtitle({
  preview,
  isInviteLoading,
  isSessionLoading,
  isAccepting,
  hasJoined,
  isWrongUser,
}: {
  preview: InvitePreview | null;
  isInviteLoading: boolean;
  isSessionLoading: boolean;
  isAccepting: boolean;
  hasJoined: boolean;
  isWrongUser: boolean;
}) {
  if (hasJoined) return 'You are in. Redirecting to the workspace.';
  if (isAccepting) return 'Accepting your invitation.';
  if (isSessionLoading) return 'Checking your signed-in account.';
  if (isInviteLoading) return 'Loading the invitation details.';
  if (isWrongUser) return 'This invite belongs to a different email.';
  if (preview) return 'Use the invited email to join this workspace.';
  return 'Open a valid invite link to join a workspace.';
}
