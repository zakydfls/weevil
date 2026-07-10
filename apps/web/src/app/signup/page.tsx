'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MailCheck,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/features/auth/auth-shell';
import { useAuth } from '@/features/auth/auth-context';
import { signInWithGoogle } from '@/features/auth/firebase-google';
import { ApiError, apiClient } from '@/lib/api/client';

interface InvitePreview {
  email: string;
  role: string;
  expiresAt: string;
  workspace: { slug: string; name: string };
  invitedBy: { email: string; displayName: string | null } | null;
}

interface SignupErrorState {
  message: string;
  action?: {
    href: string;
    label: string;
  };
}

interface OtpState {
  recipient: string;
  expiresAt: string;
  resendAvailableAt: string;
  resendCount: number;
  maxResends: number;
  maxAttempts: number;
}

type SignupStep = 'details' | 'otp';
type SignupMode = 'create' | 'join';

interface PendingApprovalState {
  email: string;
  workspace: { slug: string; name: string };
}

export default function SignupPage() {
  const auth = useAuth();
  const [inviteToken, setInviteToken] = useState('');
  const [nextPath, setNextPath] = useState('');
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [signupMode, setSignupMode] = useState<SignupMode>('create');
  const [joinWorkspaceSlug, setJoinWorkspaceSlug] = useState('');
  const [step, setStep] = useState<SignupStep>('details');
  const [otpCode, setOtpCode] = useState('');
  const [otpState, setOtpState] = useState<OtpState | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalState | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<SignupErrorState | null>(null);

  const isInviteMode = Boolean(inviteToken);
  const isJoinRequestMode = !isInviteMode && signupMode === 'join';
  const loginHref = buildAuthHref('/login', { inviteToken, next: nextPath });

  const otpExpiresInMs = otpState ? new Date(otpState.expiresAt).getTime() - nowMs : 0;
  const resendInMs = otpState ? new Date(otpState.resendAvailableAt).getTime() - nowMs : 0;
  const canResendOtp =
    Boolean(otpState) && resendInMs <= 0 && otpState!.resendCount < otpState!.maxResends && !isResending;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const showPasswordMismatch = confirmPassword.length > 0 && !passwordsMatch;
  const canSubmitDetails =
    email.trim().length > 0 &&
    password.length >= 8 &&
    passwordsMatch &&
    (isInviteMode ||
      (isJoinRequestMode
        ? isValidWorkspaceSlug(joinWorkspaceSlug.trim())
        : workspaceName.trim().length >= 2 && isValidWorkspaceSlug(workspaceSlug.trim())));
  const canSubmitGoogle =
    isInviteMode ||
    (isJoinRequestMode
      ? isValidWorkspaceSlug(joinWorkspaceSlug.trim())
      : workspaceName.trim().length >= 2 && isValidWorkspaceSlug(workspaceSlug.trim()));
  const canVerifyOtp = otpCode.length === 6 && Boolean(otpState) && otpExpiresInMs > 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('inviteToken') ?? params.get('invite') ?? '');
    setNextPath(safeNextPath(params.get('next')));
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

  useEffect(() => {
    if (!otpState) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [otpState]);

  useEffect(() => {
    if (isInviteMode) {
      setStep('details');
      setOtpCode('');
      setOtpState(null);
      setPendingApproval(null);
    }
  }, [isInviteMode]);

  function handleWorkspaceNameChange(value: string) {
    setWorkspaceName(value);
    if (!workspaceSlug || workspaceSlug === slugify(workspaceName)) {
      setWorkspaceSlug(slugify(value));
    }
  }

  function handleOtpCodeChange(value: string) {
    setOtpCode(value.replace(/\D/g, '').slice(0, 6));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isInviteMode) {
      await submitInviteSignup();
      return;
    }

    if (step === 'otp') {
      await verifyOtp();
      return;
    }

    await requestOtp(false);
  }

  async function submitInviteSignup() {
    if (!passwordsMatch) {
      setError({ message: 'Password confirmation does not match.' });
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await auth.signup(
        {
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          inviteToken,
        },
        nextPath ? { redirectTo: nextPath } : undefined,
      );
    } catch (err) {
      setError(formatSignupError(err, {
        email: email.trim(),
        isInviteMode,
        loginHref,
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestOtp(isResend: boolean) {
    if (!isResend && !passwordsMatch) {
      setError({ message: 'Password confirmation does not match.' });
      return;
    }

    if (isResend) {
      if (!canResendOtp) return;
      setIsResending(true);
    } else {
      setIsSubmitting(true);
    }
    setError(null);
    try {
      const result = await apiClient.requestSignupOtp({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
        ...(isJoinRequestMode
          ? { joinWorkspaceSlug: joinWorkspaceSlug.trim().toLowerCase() }
          : {
              workspaceName: workspaceName.trim(),
              workspaceSlug: workspaceSlug.trim(),
            }),
      });
      setOtpState(result);
      setOtpCode('');
      setStep('otp');
      setNowMs(Date.now());
    } catch (err) {
      setError(formatSignupError(err, {
        email: email.trim(),
        isInviteMode: false,
        loginHref,
      }));
    } finally {
      setIsSubmitting(false);
      setIsResending(false);
    }
  }

  async function verifyOtp() {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await auth.verifySignupOtp(
        email.trim(),
        otpCode,
        nextPath ? { redirectTo: nextPath } : undefined,
      );
      if (result.status === 'PENDING_APPROVAL') {
        setPendingApproval({
          email: result.email,
          workspace: result.workspace,
        });
        setOtpCode('');
        setOtpState(null);
      }
    } catch (err) {
      setError(formatSignupError(err, {
        email: email.trim(),
        isInviteMode: false,
        loginHref,
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitGoogleSignup() {
    setIsGoogleSubmitting(true);
    setError(null);
    try {
      const google = await signInWithGoogle();
      const result = await auth.continueWithGoogle(
        {
          idToken: google.idToken,
          intent: 'SIGNUP',
          displayName: displayName.trim() || google.displayName || undefined,
          ...(isInviteMode
            ? { inviteToken }
            : isJoinRequestMode
              ? { joinWorkspaceSlug: joinWorkspaceSlug.trim().toLowerCase() }
              : {
                  workspaceName: workspaceName.trim(),
                  workspaceSlug: workspaceSlug.trim(),
                }),
        },
        nextPath ? { redirectTo: nextPath } : undefined,
      );
      if (result.status === 'PENDING_APPROVAL') {
        setPendingApproval({
          email: result.email,
          workspace: result.workspace,
        });
      }
    } catch (err) {
      setError(formatSignupError(err, {
        email: email.trim(),
        isInviteMode,
        loginHref,
      }));
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  function editDetails() {
    setStep('details');
    setOtpCode('');
    setOtpState(null);
    setError(null);
  }

  return (
    <AuthShell
      title={
        pendingApproval
          ? 'Request sent'
          : isInviteMode
          ? `Join ${invitePreview?.workspace.name ?? 'workspace'}`
          : step === 'otp'
            ? 'Verify your email'
            : isJoinRequestMode
              ? 'Request workspace access'
              : 'Start a workspace'
      }
      subtitle={
        pendingApproval
          ? `${pendingApproval.workspace.name} will review your access request.`
          : isInviteMode
          ? 'Create your account to accept the workspace invitation.'
          : step === 'otp'
            ? `We sent a 6-digit code to ${email.trim()}.`
            : isJoinRequestMode
              ? 'Create your account and ask an admin to approve it.'
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
      {pendingApproval ? (
        <PendingApprovalPanel approval={pendingApproval} loginHref={loginHref} />
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isInviteMode ? <SignupProgress step={step} /> : null}

        {step === 'otp' && otpState ? (
          <div className="weevil-step-enter space-y-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--primary-subtle)] text-[var(--primary)]">
                  <MailCheck className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--ink)]">Code sent</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
                    It expires in <strong>{formatDuration(otpExpiresInMs)}</strong>. You have up to{' '}
                    <strong>{otpState.maxAttempts}</strong> attempts.
                  </div>
                </div>
              </div>
            </div>

            <label className="grid gap-1.5 text-sm font-medium text-[var(--ink)]">
              <span>Verification code</span>
              <Input
                value={otpCode}
                onChange={(event) => handleOtpCodeChange(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="h-12 text-center font-mono text-xl tracking-[0.42em]"
                aria-label="6-digit verification code"
              />
            </label>

            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--divider)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {canResendOtp ? 'Ready to resend' : `Resend in ${formatDuration(resendInMs)}`}
              </span>
              <button
                type="button"
                onClick={() => void requestOtp(true)}
                disabled={!canResendOtp}
                className="font-medium text-[var(--primary)] disabled:text-[var(--ink-faint)]"
              >
                {isResending ? 'Sending...' : `Resend ${otpState.resendCount}/${otpState.maxResends}`}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={editDetails} disabled={isSubmitting}>
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Edit details
              </Button>
              <Button type="submit" className="h-10 min-w-36" disabled={isSubmitting || !canVerifyOtp}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {isJoinRequestMode ? 'Verify and request access' : 'Verify and enter'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="weevil-step-enter space-y-4">
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full"
              disabled={
                isSubmitting ||
                isGoogleSubmitting ||
                isInviteLoading ||
                Boolean(inviteError) ||
                !canSubmitGoogle
              }
              onClick={() => void submitGoogleSignup()}
            >
              {isGoogleSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden />
              )}
              {isInviteMode
                ? 'Continue with Google and join'
                : isJoinRequestMode
                  ? 'Request access with Google'
                  : 'Start with Google'}
            </Button>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--divider)]" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                or use email
              </span>
              <span className="h-px flex-1 bg-[var(--divider)]" />
            </div>
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
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              isVisible={isPasswordVisible}
              onToggleVisibility={() => setIsPasswordVisible((current) => !current)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            <PasswordField
              label="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              isVisible={isConfirmPasswordVisible}
              onToggleVisibility={() => setIsConfirmPasswordVisible((current) => !current)}
              autoComplete="new-password"
              placeholder="Repeat your password"
              invalid={showPasswordMismatch}
            />
            {confirmPassword ? (
              <div
                className={`-mt-2 flex items-center gap-1.5 text-xs ${
                  passwordsMatch ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                }`}
              >
                {passwordsMatch ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                ) : null}
                {passwordsMatch ? 'Passwords match.' : 'Passwords do not match yet.'}
              </div>
            ) : null}
            {isInviteMode ? (
              <InviteCard
                isLoading={isInviteLoading}
                invitePreview={invitePreview}
                inviteError={inviteError}
              />
            ) : (
              <div className="space-y-3">
                <SignupModeChooser mode={signupMode} onChange={setSignupMode} />
                {isJoinRequestMode ? (
                  <div className="space-y-1.5">
                    <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                      Workspace slug
                    </label>
                    <Input
                      value={joinWorkspaceSlug}
                      onChange={(e) => setJoinWorkspaceSlug(slugify(e.target.value))}
                      required
                      placeholder="acme-labs"
                      className="font-mono"
                    />
                    <p className="text-xs leading-5 text-[var(--ink-muted)]">
                      An owner or admin will review the request before this account can sign in.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                        Workspace name
                      </label>
                      <Input
                        value={workspaceName}
                        onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                        required
                        placeholder="Acme Labs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                        Slug
                      </label>
                      <Input
                        value={workspaceSlug}
                        onChange={(e) => setWorkspaceSlug(slugify(e.target.value))}
                        required
                        placeholder="acme-labs"
                        className="font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <Button
              type="submit"
              className="h-10 w-full"
              disabled={isSubmitting || isInviteLoading || Boolean(inviteError) || !canSubmitDetails}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isInviteMode
                ? 'Join workspace'
                : isJoinRequestMode
                  ? 'Send access code'
                  : 'Send verification code'}
            </Button>
          </div>
        )}

        {error ? (
          <ErrorNotice message={error.message} action={error.action} />
        ) : null}
      </form>
      )}
    </AuthShell>
  );
}

function SignupModeChooser({
  mode,
  onChange,
}: {
  mode: SignupMode;
  onChange: (mode: SignupMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
      <button
        type="button"
        onClick={() => onChange('create')}
        className={`flex min-w-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          mode === 'create'
            ? 'bg-[var(--bg)] text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--border)]'
            : 'text-[var(--ink-muted)] hover:bg-[var(--primary-subtle)] hover:text-[var(--ink)]'
        }`}
      >
        <Building2 className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">New workspace</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('join')}
        className={`flex min-w-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          mode === 'join'
            ? 'bg-[var(--bg)] text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--border)]'
            : 'text-[var(--ink-muted)] hover:bg-[var(--primary-subtle)] hover:text-[var(--ink)]'
        }`}
      >
        <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Request access</span>
      </button>
    </div>
  );
}

function PendingApprovalPanel({
  approval,
  loginHref,
}: {
  approval: PendingApprovalState;
  loginHref: string;
}) {
  return (
    <div className="weevil-step-enter space-y-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--success-bg)] text-[var(--success)]">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--ink)]">
              Waiting for admin approval
            </div>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
              We verified <span className="font-medium text-[var(--ink)]">{approval.email}</span> and sent the request to{' '}
              <span className="font-medium text-[var(--ink)]">{approval.workspace.name}</span>.
            </p>
            <div className="mt-3 rounded-md border border-[var(--divider)] bg-[var(--bg)] px-3 py-2 font-mono text-[11px] text-[var(--ink-muted)]">
              workspace · {approval.workspace.slug}
            </div>
          </div>
        </div>
      </div>
      <Button asChild variant="secondary" className="h-10 w-full">
        <Link href={loginHref}>Back to sign in</Link>
      </Button>
    </div>
  );
}

function SignupProgress({ step }: { step: SignupStep }) {
  const isOtpStep = step === 'otp';

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-center gap-3">
        <StepMarker
          icon={isOtpStep ? CheckCircle2 : ShieldCheck}
          label="Account details"
          state={isOtpStep ? 'done' : 'active'}
        />
        <div className="h-px flex-1 overflow-hidden rounded-full bg-[var(--divider)]">
          <div
            className={`h-full rounded-full bg-[var(--primary)] transition-all duration-500 ${
              isOtpStep ? 'w-full' : 'w-1/3'
            }`}
          />
        </div>
        <StepMarker
          icon={MailCheck}
          label="Verify email"
          state={isOtpStep ? 'active' : 'upcoming'}
        />
      </div>
    </div>
  );
}

function StepMarker({
  icon: Icon,
  label,
  state,
}: {
  icon: typeof ShieldCheck;
  label: string;
  state: 'active' | 'done' | 'upcoming';
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors ${
          state === 'upcoming'
            ? 'border-[var(--border)] bg-[var(--bg)] text-[var(--ink-faint)]'
            : 'border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)]'
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span
        className={`truncate text-xs font-semibold ${
          state === 'upcoming' ? 'text-[var(--ink-muted)]' : 'text-[var(--ink)]'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function InviteCard({
  isLoading,
  invitePreview,
  inviteError,
}: {
  isLoading: boolean;
  invitePreview: InvitePreview | null;
  inviteError: string | null;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
      {isLoading ? (
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
  );
}

function ErrorNotice({
  message,
  action,
}: {
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
      <span>{message}</span>
      {action ? (
        <Link href={action.href} className="ml-1 underline underline-offset-2">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  isVisible,
  onToggleVisibility,
  autoComplete,
  placeholder,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isVisible: boolean;
  onToggleVisibility: () => void;
  autoComplete: string;
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
        {label}
      </label>
      <div className="relative">
        <Input
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={8}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={invalid}
          className={`pr-10 ${invalid ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger-bg)]' : ''}`}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--primary-subtle)] hover:text-[var(--ink)]"
          aria-label={isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {isVisible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
}

function isValidWorkspaceSlug(value: string): boolean {
  return /^[a-z0-9-]{2,40}$/.test(value);
}

function formatDuration(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(valueMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

function formatSignupError(
  error: unknown,
  context: { email: string; isInviteMode: boolean; loginHref: string },
): SignupErrorState {
  if (error instanceof ApiError) {
    const message = error.message.toLowerCase();

    if (error.status === 409 && message.includes('account') && message.includes('email')) {
      return {
        message: context.isInviteMode
          ? `An account already exists for ${context.email}. Sign in to accept this invite.`
          : `An account already exists for ${context.email}. Sign in instead.`,
        action: {
          href: context.loginHref,
          label: context.isInviteMode ? 'Sign in to accept invite' : 'Sign in',
        },
      };
    }

    if (error.status === 409 && message.includes('access request')) {
      return {
        message: 'That email already has a workspace access request waiting for approval.',
      };
    }

    if (error.status === 409 && message.includes('slug')) {
      return {
        message: 'That workspace slug is already taken. Try a different slug.',
      };
    }

    if (error.status === 401 && message.includes('invite')) {
      return {
        message: 'This invite was sent to a different email. Use the invited email or ask for a new invite.',
      };
    }

    if (error.status === 404 && message.includes('workspace')) {
      return {
        message: 'No active workspace was found with that slug. Check the slug and try again.',
      };
    }

    return { message: error.message };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: 'We could not create your account. Try again in a moment.' };
}
