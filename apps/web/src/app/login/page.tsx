'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/features/auth/auth-shell';
import { useAuth } from '@/features/auth/auth-context';

const devSeedEmail = process.env.NODE_ENV === 'development' ? (process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL ?? '') : '';
const devSeedPassword = process.env.NODE_ENV === 'development' ? (process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD ?? '') : '';
const showDevSeedHint = Boolean(devSeedEmail && devSeedPassword);

export default function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState(devSeedEmail);
  const [password, setPassword] = useState(devSeedPassword);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await auth.login(email.trim(), password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      setError(message.includes('401') ? 'Invalid email or password.' : message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={
        <span>
          New to Weevil?{' '}
          <Link href="/signup" className="font-medium text-[var(--primary)] hover:underline">
            Create an account
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)] font-mono">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)] font-mono">
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          Sign in
        </Button>
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
