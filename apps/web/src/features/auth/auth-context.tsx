'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient, onAuthError, setActiveWorkspaceSlug, setAuthToken } from '@/lib/api/client';

interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  platformRole: string;
}

interface ActiveWorkspace {
  id: string;
  slug: string;
  name: string;
  role: string;
  permissions: Set<string>;
}

interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  role: string;
}

type SignupOtpVerificationResult =
  | {
      status: 'ACTIVE';
      userId: string;
      workspaceId: string;
    }
  | {
      status: 'PENDING_APPROVAL';
      userId: string;
      workspaceId: string;
      email: string;
      workspace: { slug: string; name: string };
    };

type GoogleAuthResult =
  | {
      status: 'ACTIVE';
      userId: string;
      workspaceId: string | null;
    }
  | Extract<SignupOtpVerificationResult, { status: 'PENDING_APPROVAL' }>;

interface AuthContextValue {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: AuthUser | null;
  workspace: ActiveWorkspace | null;
  workspaces: WorkspaceSummary[];
  can: (permission: string) => boolean;
  login: (
    email: string,
    password: string,
    options?: { inviteToken?: string; redirectTo?: string },
  ) => Promise<void>;
  continueWithGoogle: (input: {
    idToken: string;
    intent?: 'LOGIN' | 'SIGNUP';
    displayName?: string;
    workspaceName?: string;
    workspaceSlug?: string;
    joinWorkspaceSlug?: string;
    inviteToken?: string;
  }, options?: { redirectTo?: string }) => Promise<GoogleAuthResult>;
  signup: (input: {
    email: string;
    password: string;
    displayName?: string;
    workspaceName?: string;
    workspaceSlug?: string;
    inviteToken?: string;
  }, options?: { redirectTo?: string }) => Promise<void>;
  verifySignupOtp: (
    email: string,
    code: string,
    options?: { redirectTo?: string },
  ) => Promise<SignupOtpVerificationResult>;
  logout: (options?: { redirectTo?: string }) => Promise<void>;
  acceptInvite: (inviteToken: string) => Promise<void>;
  createWorkspace: (input: { name: string; slug: string }) => Promise<void>;
  switchWorkspace: (slug: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const WORKSPACE_STORAGE_KEY = 'weevil.auth.workspace';
const LEGACY_TOKEN_STORAGE_KEY = 'weevil.auth.token';
const SESSION_TOKEN_STORAGE_KEY = 'weevil.auth.session_token';

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_PATHS = new Set(['/login', '/signup']);
const PUBLIC_PATHS = new Set([...AUTH_PATHS, '/accept-invite', '/c/share', '/', '/support', '/privacy']);

function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return Array.from(PUBLIC_PATHS).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isAuthPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return AUTH_PATHS.has(pathname);
}

function loadToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  setAuthToken(token);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    } catch {
      // Ignore private-mode storage quirks; auth still works for this tab.
    }
    try {
      if (token) {
        window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Cookies remain the primary auth channel. Session storage is only a
      // refresh fallback for browsers that block cross-site cookies.
    }
  }
}

function loadWorkspaceSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
}

function saveWorkspaceSlug(slug: string | null) {
  if (typeof window === 'undefined') return;
  if (slug) {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, slug);
  } else {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [meResponse, workspacesResponse] = await Promise.all([
        apiClient.me(),
        apiClient.listMyWorkspaces().catch(() => []),
      ]);
      setUser(meResponse.user);
      const wsList = workspacesResponse.map((w) => ({
        id: w.id,
        slug: w.slug,
        name: w.name,
        role: w.role,
      }));
      setWorkspaces(wsList);
      setWorkspace(
        meResponse.workspace
          ? {
              id: meResponse.workspace.id,
              slug: meResponse.workspace.slug,
              name:
                wsList.find((w) => w.id === meResponse.workspace!.id)?.name ??
                meResponse.workspace.slug,
              role: meResponse.workspace.role,
              permissions: new Set(meResponse.workspace.permissions),
            }
          : null,
      );
      if (meResponse.workspace?.slug) {
        saveWorkspaceSlug(meResponse.workspace.slug);
        setActiveWorkspaceSlug(meResponse.workspace.slug);
      }
      setStatus('authenticated');
    } catch {
      // Token invalid → clear and bounce.
      saveToken(null);
      setAuthToken(null);
      setStatus('unauthenticated');
      setUser(null);
      setWorkspace(null);
      setWorkspaces([]);
    }
  }, []);

  // Bootstrap from storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
      } catch {
        // Ignore storage failures in private browsing modes.
      }
    }
    const storedToken = loadToken();
    const storedSlug = loadWorkspaceSlug();
    if (storedSlug) setActiveWorkspaceSlug(storedSlug);
    if (storedToken) {
      setAuthToken(storedToken);
      void refresh();
    } else {
      void refresh();
    }
  }, [refresh]);

  // Bounce unauthenticated users from protected routes
  useEffect(() => {
    if (status !== 'unauthenticated') return;
    if (!pathname || isPublicPath(pathname)) return;
    router.replace('/login');
  }, [status, pathname, router]);

  // Auth pages are guest-only. If the browser already has a valid session,
  // send users back to the app instead of showing login/signup again.
  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!isAuthPath(pathname)) return;

    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('inviteToken') ?? params.get('invite');
    const nextPath = resolveRedirectTo(params.get('next') ?? undefined);

    if (inviteToken) {
      const inviteParams = new URLSearchParams({ inviteToken });
      if (nextPath !== '/') {
        inviteParams.set('next', nextPath);
      }
      router.replace(`/accept-invite?${inviteParams.toString()}`);
      return;
    }

    router.replace(nextPath);
  }, [status, pathname, router]);

  // Handle 401 from any API call → log out
  useEffect(() => {
    onAuthError(() => {
      saveToken(null);
      setAuthToken(null);
      setStatus('unauthenticated');
      setUser(null);
      setWorkspace(null);
    });
    return () => onAuthError(null);
  }, []);

  const acceptInvite = useCallback<AuthContextValue['acceptInvite']>(
    async (inviteToken) => {
      const result = await apiClient.acceptInvite({ inviteToken });
      saveWorkspaceSlug(result.workspace.slug);
      setActiveWorkspaceSlug(result.workspace.slug);
      await refresh();
    },
    [refresh],
  );

  const login = useCallback(
    async (
      email: string,
      password: string,
      options?: { inviteToken?: string; redirectTo?: string },
    ) => {
      const result = await apiClient.login({ email, password });
      saveToken(result.token);
      setAuthToken(result.token);
      if (options?.inviteToken) {
        try {
          await acceptInvite(options.inviteToken);
        } catch (err) {
          await refresh().catch(() => undefined);
          throw err;
        }
      } else {
        await refresh();
      }
      router.push(resolveRedirectTo(options?.redirectTo));
    },
    [acceptInvite, refresh, router],
  );

  const signup = useCallback<AuthContextValue['signup']>(
    async (input, options) => {
      const result = await apiClient.signup(input);
      saveToken(result.token);
      setAuthToken(result.token);
      await refresh();
      router.push(resolveRedirectTo(options?.redirectTo));
    },
    [refresh, router],
  );

  const continueWithGoogle = useCallback<AuthContextValue['continueWithGoogle']>(
    async (input, options) => {
      const result = await apiClient.firebaseGoogleOAuth(input);
      if (result.status === 'PENDING_APPROVAL') {
        return result;
      }
      saveToken(result.token);
      setAuthToken(result.token);
      await refresh();
      router.push(resolveRedirectTo(options?.redirectTo));
      return {
        status: 'ACTIVE',
        userId: result.userId,
        workspaceId: result.workspaceId,
      };
    },
    [refresh, router],
  );

  const verifySignupOtp = useCallback<AuthContextValue['verifySignupOtp']>(
    async (email, code, options) => {
      const result = await apiClient.verifySignupOtp({ email, code });
      if (result.status === 'PENDING_APPROVAL') {
        return result;
      }
      saveToken(result.token);
      setAuthToken(result.token);
      await refresh();
      router.push(resolveRedirectTo(options?.redirectTo));
      return {
        status: 'ACTIVE',
        userId: result.userId,
        workspaceId: result.workspaceId,
      };
    },
    [refresh, router],
  );

  const logout = useCallback<AuthContextValue['logout']>(async (options) => {
    await apiClient.logout().catch(() => undefined);
    saveToken(null);
    saveWorkspaceSlug(null);
    setAuthToken(null);
    setActiveWorkspaceSlug(null);
    setStatus('unauthenticated');
    setUser(null);
    setWorkspace(null);
    setWorkspaces([]);
    router.replace(options?.redirectTo ?? '/login');
  }, [router]);

  const createWorkspace = useCallback<AuthContextValue['createWorkspace']>(
    async (input) => {
      const workspace = await apiClient.createWorkspace(input);
      saveWorkspaceSlug(workspace.slug);
      setActiveWorkspaceSlug(workspace.slug);
      await refresh();
    },
    [refresh],
  );

  const switchWorkspace = useCallback(
    async (slug: string) => {
      const previousSlug = workspace?.slug ?? loadWorkspaceSlug();
      setActiveWorkspaceSlug(null);
      try {
        const workspace = await apiClient.switchWorkspace({ slug });
        saveWorkspaceSlug(workspace.slug);
        setActiveWorkspaceSlug(workspace.slug);
        await refresh();
      } catch (error) {
        setActiveWorkspaceSlug(previousSlug);
        throw error;
      }
    },
    [refresh, workspace?.slug],
  );

  const can = useCallback(
    (permission: string) => {
      if (!workspace) return false;
      return workspace.permissions.has(permission);
    },
    [workspace],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      workspace,
      workspaces,
      can,
      login,
      continueWithGoogle,
      signup,
      verifySignupOtp,
      logout,
      acceptInvite,
      createWorkspace,
      switchWorkspace,
      refresh,
    }),
    [
      status,
      user,
      workspace,
      workspaces,
      can,
      login,
      continueWithGoogle,
      signup,
      verifySignupOtp,
      logout,
      acceptInvite,
      createWorkspace,
      switchWorkspace,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be called inside <AuthProvider>');
  return ctx;
}

function resolveRedirectTo(redirectTo: string | undefined): string {
  if (!redirectTo || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return '/';
  }
  return redirectTo;
}
