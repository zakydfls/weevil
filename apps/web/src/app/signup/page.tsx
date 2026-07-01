'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export default function SignupPage() {
  const auth = useAuth();
  const [inviteToken, setInviteToken] = useState('');
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInviteMode = Boolean(inviteToken);
  const loginHref = inviteToken
    ? `/login?inviteToken=${encodeURIComponent(inviteToken)}`
    : '/login';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('inviteToken') ?? params.get('invite') ?? '');
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setInvitePreview(null);
      setInviteError(null);
      setIsInviteLoading(false);
      return;
    }

    let isActive = true;
    setIsInviteLoading(true);
    setInviteError(null);
    void apiClient
      .getInvitePreview(inviteToken)
      .then((preview) => {
        if (!isActive) return;
        setInvitePreview(preview);
        setEmail(preview.email);
        setWorkspaceName(preview.workspace.name);
        setWorkspaceSlug(preview.workspace.slug);
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

  function handleWorkspaceNameChange(value: string) {
    setWorkspaceName(value);
    if (!workspaceSlug || workspaceSlug === slugify(workspaceName)) {
      setWorkspaceSlug(slugify(value));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await auth.signup({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
        workspaceName: isInviteMode ? undefined : workspaceName.trim() || undefined,
        workspaceSlug: isInviteMode ? undefined : workspaceSlug.trim() || undefined,
        inviteToken: isInviteMode ? inviteToken : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title={
        isInviteMode ? `Join ${invitePreview?.workspace.name ?? 'workspace'}` : 'Start a workspace'
      }
      subtitle={
        isInviteMode
          ? 'Create your account to accept the workspace invitation.'
          : 'Create an account and your first workspace.'
      }
      footer={
        <span>
          Already have an account?{' '}
          <Link href={loginHref} className="font-medium text-[var(--primary)] hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            Your email
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting || (isInviteMode && !inviteError)}
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            Full name
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            placeholder="Maya Rodriguez"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            Password
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </div>
        {isInviteMode ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
            {isInviteLoading ? (
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
                {inviteError ?? 'Invite unavailable.'}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                Workspace name
              </label>
              <Input
                value={workspaceName}
                onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                placeholder="Acme Labs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                Slug
              </label>
              <Input
                value={workspaceSlug}
                onChange={(e) => setWorkspaceSlug(e.target.value)}
                placeholder="acme-labs"
                className="font-mono"
              />
            </div>
          </div>
        )}
        {inviteError ? (
          <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
            {inviteError}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        <Button
          type="submit"
          className="h-10 w-full"
          disabled={isSubmitting || isInviteLoading || Boolean(inviteError)}
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isInviteMode ? 'Join workspace' : 'Create workspace'}
        </Button>
      </form>
    </AuthShell>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
