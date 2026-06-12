'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/features/auth/auth-shell';
import { useAuth } from '@/features/auth/auth-context';

export default function SignupPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        workspaceName: workspaceName.trim() || undefined,
        workspaceSlug: workspaceSlug.trim() || undefined,
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
      title="Start a workspace"
      subtitle="Create an account and your first workspace."
      footer={
        <span>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">
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
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
            Full name
          </label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" placeholder="Maya Rodriguez" />
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
              Workspace name
            </label>
            <Input value={workspaceName} onChange={(e) => handleWorkspaceNameChange(e.target.value)} placeholder="Acme Labs" />
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
        {error ? (
          <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create workspace
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
