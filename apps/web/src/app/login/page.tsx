"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Building2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/features/auth/auth-shell";
import { useAuth } from "@/features/auth/auth-context";
import { signInWithGoogle } from "@/features/auth/firebase-google";
import { GoogleIcon } from "@/features/auth/google-icon";
import { ApiError, apiClient } from "@/lib/api/client";
import { appEnv, readPublicEnv } from "@/lib/env";

const devSeedEmail = appEnv.canShowDevOnlyUi
  ? readPublicEnv(process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL)
  : "";
const devSeedPassword = appEnv.canShowDevOnlyUi
  ? readPublicEnv(process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD)
  : "";
const showDevSeedHint = Boolean(devSeedEmail && devSeedPassword);

interface InvitePreview {
  email: string;
  role: string;
  expiresAt: string;
  workspace: { slug: string; name: string };
  invitedBy: { email: string; displayName: string | null } | null;
}

interface GoogleRegistrationState {
  idToken: string;
  email: string;
  displayName: string | null;
}

interface LoginOtpState {
  recipient: string;
  channel: "email" | "whatsapp";
  expiresAt: string;
  resendAvailableAt: string;
  resendCount: number;
  maxResends: number;
  maxAttempts: number;
}

export default function LoginPage() {
  const auth = useAuth();
  const [inviteToken, setInviteToken] = useState("");
  const [nextPath, setNextPath] = useState("");
  const [email, setEmail] = useState(devSeedEmail);
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [password, setPassword] = useState(devSeedPassword);
  const [otpCode, setOtpCode] = useState("");
  const [otpState, setOtpState] = useState<LoginOtpState | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(
    null,
  );
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [submitPhase, setSubmitPhase] = useState<
    "idle" | "checking" | "redirecting"
  >("idle");
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [googleRegistration, setGoogleRegistration] =
    useState<GoogleRegistrationState | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = submitPhase !== "idle" || isGoogleSubmitting;
  const canCompleteGoogleRegistration =
    workspaceName.trim().length >= 2 &&
    isValidWorkspaceSlug(workspaceSlug.trim());
  const signupHref = buildAuthHref("/signup", { inviteToken, next: nextPath });
  const otpExpiresInMs = otpState
    ? new Date(otpState.expiresAt).getTime() - nowMs
    : 0;
  const resendInMs = otpState
    ? new Date(otpState.resendAvailableAt).getTime() - nowMs
    : 0;
  const canResend =
    Boolean(otpState) &&
    resendInMs <= 0 &&
    otpState!.resendCount < otpState!.maxResends;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get("inviteToken") ?? params.get("invite") ?? "");
    setNextPath(safeNextPath(params.get("next")));
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setInvitePreview(null);
      setInviteError("");
      setIsInviteLoading(false);
      return;
    }

    let isActive = true;
    setIsInviteLoading(true);
    setInviteError("");
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
        setInviteError("This invite link is invalid or expired.");
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

  async function requestLoginOtp() {
    const result = await apiClient.login({
      identifier: email.trim(),
      password,
      channel,
    });
    setOtpState(result);
    setOtpCode("");
    setNowMs(Date.now());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitPhase("checking");
    setError(null);
    try {
      if (!otpState) {
        await requestLoginOtp();
        setSubmitPhase("idle");
      } else {
        await auth.verifyLoginOtp(
          { identifier: email.trim(), channel, code: otpCode, rememberMe },
          {
            ...(inviteToken ? { inviteToken } : {}),
            ...(nextPath ? { redirectTo: nextPath } : {}),
          },
        );
        setSubmitPhase("redirecting");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed.";
      setError(
        err instanceof ApiError && err.status === 401
          ? "Invalid credentials, identity, or verification code."
          : message,
      );
      setSubmitPhase("idle");
    }
  }

  async function resendLoginOtp() {
    if (!canResend) return;
    setSubmitPhase("checking");
    setError(null);
    try {
      await requestLoginOtp();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not resend the code.",
      );
    } finally {
      setSubmitPhase("idle");
    }
  }

  async function handleGoogleLogin() {
    setIsGoogleSubmitting(true);
    setError(null);
    try {
      const google = await signInWithGoogle();
      const result = await auth.continueWithGoogle(
        {
          idToken: google.idToken,
          intent: "LOGIN",
          displayName: google.displayName ?? undefined,
          ...(inviteToken ? { inviteToken } : {}),
        },
        nextPath ? { redirectTo: nextPath } : undefined,
      );
      if (result.status === "PENDING_APPROVAL") {
        setError(
          `${result.workspace.name} still needs to approve your access request.`,
        );
        setIsGoogleSubmitting(false);
      } else if (result.status === "REGISTRATION_REQUIRED") {
        setGoogleRegistration({
          idToken: google.idToken,
          email: result.email,
          displayName: result.displayName ?? google.displayName,
        });
        setIsGoogleSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setIsGoogleSubmitting(false);
    }
  }

  async function handleGoogleRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!googleRegistration || !canCompleteGoogleRegistration) return;

    setIsGoogleSubmitting(true);
    setError(null);
    try {
      const result = await auth.continueWithGoogle(
        {
          idToken: googleRegistration.idToken,
          intent: "SIGNUP",
          displayName: googleRegistration.displayName ?? undefined,
          workspaceName: workspaceName.trim(),
          workspaceSlug: workspaceSlug.trim(),
        },
        nextPath ? { redirectTo: nextPath } : undefined,
      );
      if (result.status === "PENDING_APPROVAL") {
        setError(
          `${result.workspace.name} still needs to approve your access request.`,
        );
        setIsGoogleSubmitting(false);
      } else if (result.status === "REGISTRATION_REQUIRED") {
        setError("Finish your workspace details to create this account.");
        setIsGoogleSubmitting(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google account setup failed.",
      );
      setIsGoogleSubmitting(false);
    }
  }

  function handleWorkspaceNameChange(value: string) {
    setWorkspaceName(value);
    if (!workspaceSlug || workspaceSlug === slugify(workspaceName)) {
      setWorkspaceSlug(slugify(value));
    }
  }

  function resetGoogleRegistration() {
    setGoogleRegistration(null);
    setWorkspaceName("");
    setWorkspaceSlug("");
    setError(null);
  }

  return (
    <AuthShell
      title={
        googleRegistration
          ? "Set up your workspace"
          : invitePreview
            ? `Join ${invitePreview.workspace.name}`
            : "Welcome back"
      }
      subtitle={
        googleRegistration
          ? "Your Google account is verified. Add the workspace your team will work from."
          : invitePreview
            ? `Sign in as ${invitePreview.email} to accept this invitation.`
            : inviteToken
              ? "Sign in to accept your workspace invitation."
              : "Sign in to your workspace."
      }
      footer={
        googleRegistration ? null : (
          <span>
            New to Weevil?{" "}
            <Link
              href={signupHref}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Create an account
            </Link>
          </span>
        )
      }
    >
      {googleRegistration ? (
        <form
          onSubmit={handleGoogleRegistration}
          className="weevil-step-enter space-y-4"
        >
          <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--divider)] bg-white">
              <GoogleIcon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--ink-muted)]">
                Google account verified
              </div>
              <div className="truncate text-sm font-semibold text-[var(--ink)]">
                {googleRegistration.email}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="google-workspace-name"
              className="block text-xs font-semibold text-[var(--ink-muted)]"
            >
              Workspace name
            </label>
            <Input
              id="google-workspace-name"
              value={workspaceName}
              onChange={(event) =>
                handleWorkspaceNameChange(event.target.value)
              }
              disabled={isGoogleSubmitting}
              autoComplete="organization"
              placeholder="Acme Labs"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="google-workspace-slug"
              className="block text-xs font-semibold text-[var(--ink-muted)]"
            >
              Workspace URL
            </label>
            <div className="flex h-9 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary-subtle)]">
              <span className="flex shrink-0 items-center border-r border-[var(--divider)] bg-[var(--surface)] px-2.5 font-mono text-xs text-[var(--ink-muted)]">
                /w/
              </span>
              <input
                id="google-workspace-slug"
                value={workspaceSlug}
                onChange={(event) =>
                  setWorkspaceSlug(slugify(event.target.value))
                }
                disabled={isGoogleSubmitting}
                className="min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-50"
                placeholder="acme-labs"
                pattern="[a-z0-9-]{2,40}"
                maxLength={40}
                required
              />
            </div>
            <p className="text-xs leading-5 text-[var(--ink-muted)]">
              Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          {error ? (
            <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            className="h-10 w-full"
            disabled={isGoogleSubmitting || !canCompleteGoogleRegistration}
          >
            {isGoogleSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" aria-hidden />
            )}
            {isGoogleSubmitting
              ? "Creating workspace"
              : "Create workspace and continue"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full"
            disabled={isGoogleSubmitting}
            onClick={resetGoogleRegistration}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Use another sign-in method
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Button
            type="button"
            variant="secondary"
            className="h-10 w-full"
            disabled={isSubmitting || Boolean(inviteError) || Boolean(otpState)}
            onClick={() => void handleGoogleLogin()}
          >
            {isGoogleSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon className="h-[18px] w-[18px]" />
            )}
            {inviteToken
              ? "Continue with Google and join"
              : "Continue with Google"}
          </Button>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--divider)]" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              or
            </span>
            <span className="h-px flex-1 bg-[var(--divider)]" />
          </div>
          {!inviteToken ? (
            <fieldset
              className="space-y-2"
              disabled={isSubmitting || Boolean(otpState)}
            >
              <legend className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                Sign in with
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["email", "whatsapp"] as const).map((option) => {
                  const selected = channel === option;
                  const Icon = option === "email" ? Mail : MessageCircle;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setChannel(option);
                        setEmail("");
                      }}
                      aria-pressed={selected}
                      className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors disabled:opacity-60 ${
                        selected
                          ? "border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)]"
                          : "border-[var(--border)] bg-[var(--bg)] text-[var(--ink-muted)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {option === "email" ? "Email" : "WhatsApp"}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)] font-mono"
            >
              {channel === "email" ? "Email" : "WhatsApp number"}
            </label>
            <Input
              id="email"
              type={channel === "email" ? "email" : "tel"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={
                isSubmitting || Boolean(invitePreview) || Boolean(otpState)
              }
              required
              autoComplete={channel === "email" ? "email" : "tel"}
              inputMode={channel === "email" ? "email" : "tel"}
              placeholder={
                channel === "email" ? "you@example.com" : "+628123456789"
              }
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
                  {inviteError || "Invite unavailable."}
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
                type={isPasswordVisible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting || Boolean(otpState)}
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
                aria-label={
                  isPasswordVisible ? "Hide password" : "Show password"
                }
              >
                {isPasswordVisible ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </div>
          {otpState ? (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--primary-subtle)] text-[var(--primary)]">
                  <KeyRound className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 text-xs leading-5 text-[var(--ink-muted)]">
                  Code sent to <strong>{otpState.recipient}</strong>. Expires in{" "}
                  <strong>{formatDuration(otpExpiresInMs)}</strong>.
                </div>
              </div>
              <Input
                value={otpCode}
                onChange={(event) =>
                  setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="h-12 text-center font-mono text-xl tracking-[0.42em]"
                aria-label="6-digit verification code"
              />
              <div className="flex items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden />
                  {canResend
                    ? "Ready to resend"
                    : `Resend in ${formatDuration(resendInMs)}`}
                </span>
                <button
                  type="button"
                  onClick={() => void resendLoginOtp()}
                  disabled={!canResend || isSubmitting}
                  className="font-medium text-[var(--primary)] disabled:text-[var(--ink-faint)]"
                >
                  Resend
                </button>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--ink-muted)]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                />
                <span>
                  <strong className="text-[var(--ink)]">
                    Remember this device
                  </strong>
                  <br />
                  Stay signed in for up to 30 days.
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setOtpState(null);
                  setOtpCode("");
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Change sign-in details
              </button>
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
            disabled={
              isSubmitting ||
              Boolean(inviteError) ||
              (otpState ? otpCode.length !== 6 || otpExpiresInMs <= 0 : false)
            }
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitPhase === "checking"
              ? otpState
                ? "Verifying code"
                : "Sending code"
              : submitPhase === "redirecting"
                ? "Opening dashboard"
                : inviteToken
                  ? otpState
                    ? "Verify and join"
                    : "Continue"
                  : otpState
                    ? "Verify and sign in"
                    : "Continue"}
          </Button>
          {isSubmitting ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]"
            >
              {submitPhase === "redirecting"
                ? "Workspace loaded. Redirecting..."
                : otpState
                  ? "Verifying your one-time code..."
                  : "Sending a one-time code..."}
            </div>
          ) : null}
          {showDevSeedHint ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              dev login:{" "}
              <span className="normal-case tracking-normal text-[var(--ink-muted)]">
                {devSeedEmail} / {devSeedPassword}
              </span>
            </div>
          ) : null}
        </form>
      )}
    </AuthShell>
  );
}

function buildAuthHref(
  pathname: string,
  params: { inviteToken?: string; next?: string },
): string {
  const searchParams = new URLSearchParams();
  if (params.inviteToken) searchParams.set("inviteToken", params.inviteToken);
  if (params.next) searchParams.set("next", params.next);
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "";
  }
  return value;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function isValidWorkspaceSlug(value: string): boolean {
  return /^[a-z0-9-]{2,40}$/.test(value);
}

function formatDuration(valueMs: number): string {
  const seconds = Math.max(0, Math.ceil(valueMs / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0
    ? `${minutes}:${remainder.toString().padStart(2, "0")}`
    : `${seconds}s`;
}
