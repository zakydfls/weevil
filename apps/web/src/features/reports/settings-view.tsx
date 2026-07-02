'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  LayoutGrid,
  Loader2,
  MessageSquareText,
  Rows3,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import { WeevilMark } from '@/components/brand/weevil-mark';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MembersPanel } from '@/features/auth/members-panel';
import { useAuth } from '@/features/auth/auth-context';
import { apiClient } from '@/lib/api/client';
import type { NotificationPreferences } from '@/lib/api/types';
import { getExtensionStatus, updateExtensionSettings } from '@/lib/extension-bridge';
import { PageHeader } from './components/page-chrome';

type SettingsSection = 'members' | 'notifications' | 'privacy' | 'shortcuts' | 'about';

function readRedactionSetting(response: unknown) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return undefined;
  }
  const directSettings = (response as { settings?: unknown }).settings;
  const payload = (response as { payload?: unknown }).payload;
  const payloadSettings =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as { settings?: unknown }).settings
      : undefined;
  const settings = directSettings ?? payloadSettings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return undefined;
  }
  const value = (settings as { redactSensitiveData?: unknown }).redactSensitiveData;
  return typeof value === 'boolean' ? value : undefined;
}

export function SettingsView() {
  const auth = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>('members');
  const [redactSensitiveData, setRedactSensitiveData] = useState(true);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>({
      emailOnNewCapture: false,
      emailOnNewComment: false,
    });
  const [isSaving, setIsSaving] = useState(false);
  const [isNotificationLoading, setIsNotificationLoading] = useState(true);
  const [savingNotificationKey, setSavingNotificationKey] =
    useState<keyof NotificationPreferences | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'synced' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notificationSyncState, setNotificationSyncState] =
    useState<Record<keyof NotificationPreferences, 'idle' | 'synced' | 'failed'>>({
      emailOnNewCapture: 'idle',
      emailOnNewComment: 'idle',
    });
  const [notificationSyncError, setNotificationSyncError] =
    useState<Record<keyof NotificationPreferences, string | null>>({
      emailOnNewCapture: null,
      emailOnNewComment: null,
    });

  useEffect(() => {
    const stored = window.localStorage.getItem('weevil.redact-sensitive-data');
    if (stored) {
      setRedactSensitiveData(stored === 'true');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function syncExtensionPrivacy() {
      try {
        const response = await getExtensionStatus();
        const redactSetting = readRedactionSetting(response);
        if (isMounted && typeof redactSetting === 'boolean') {
          setRedactSensitiveData(redactSetting);
          window.localStorage.setItem('weevil.redact-sensitive-data', String(redactSetting));
        }
      } catch {
        // The dashboard still stores the preference when the extension isn't installed/reloaded.
      }
    }
    void syncExtensionPrivacy();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsNotificationLoading(true);
    setNotificationSyncState({ emailOnNewCapture: 'idle', emailOnNewComment: 'idle' });
    setNotificationSyncError({ emailOnNewCapture: null, emailOnNewComment: null });

    void apiClient
      .getNotificationPreferences()
      .then((preferences) => {
        if (!isMounted) return;
        setNotificationPreferences(preferences);
      })
      .catch((error) => {
        if (!isMounted) return;
        setNotificationSyncState({ emailOnNewCapture: 'failed', emailOnNewComment: 'failed' });
        setNotificationSyncError({
          emailOnNewCapture: error instanceof Error ? error.message : String(error),
          emailOnNewComment: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (isMounted) setIsNotificationLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [auth.workspace?.id]);

  async function handleRedactionChange(value: boolean) {
    const previousValue = redactSensitiveData;
    setRedactSensitiveData(value);
    setIsSaving(true);
    setSyncState('idle');
    setSyncError(null);
    window.localStorage.setItem('weevil.redact-sensitive-data', String(value));
    try {
      await updateExtensionSettings({ redactSensitiveData: value });
      setSyncState('synced');
    } catch (error) {
      setRedactSensitiveData(previousValue);
      window.localStorage.setItem('weevil.redact-sensitive-data', String(previousValue));
      setSyncState('failed');
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleNotificationPreferenceChange(
    key: keyof NotificationPreferences,
    value: boolean,
  ) {
    const previousValue = notificationPreferences;
    const nextValue = { ...notificationPreferences, [key]: value };
    setNotificationPreferences(nextValue);
    setSavingNotificationKey(key);
    setNotificationSyncState((current) => ({ ...current, [key]: 'idle' }));
    setNotificationSyncError((current) => ({ ...current, [key]: null }));
    try {
      const saved = await apiClient.updateNotificationPreferences({ [key]: value });
      setNotificationPreferences(saved);
      setNotificationSyncState((current) => ({ ...current, [key]: 'synced' }));
    } catch (error) {
      setNotificationPreferences(previousValue);
      setNotificationSyncState((current) => ({ ...current, [key]: 'failed' }));
      setNotificationSyncError((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setSavingNotificationKey(null);
    }
  }

  const sections = [
    { id: 'members' as const, label: 'Members', icon: Users },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'privacy' as const, label: 'Privacy', icon: ShieldCheck },
    { id: 'shortcuts' as const, label: 'Shortcuts', icon: Rows3 },
    { id: 'about' as const, label: 'About', icon: LayoutGrid },
  ];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-5xl flex-col">
      <PageHeader
        title="Settings"
        subtitle="Workspace preferences, access, and capture behavior."
      />
      <Tabs
        value={activeSection}
        onValueChange={(value) => setActiveSection(value as SettingsSection)}
        className="grid flex-1 gap-6 px-4 pb-10 sm:px-6 md:gap-8 md:grid-cols-[12rem_1fr]"
      >
        <TabsList
          aria-label="Settings sections"
          className="scrollbar-none -mx-4 flex justify-start overflow-x-auto rounded-none border-x-0 border-t-0 bg-transparent px-4 pb-3 sm:-mx-6 sm:px-6 md:mx-0 md:h-max md:flex-col md:items-stretch md:rounded-lg md:border md:bg-[var(--surface)] md:p-1"
        >
          {sections.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="shrink-0 justify-start md:w-full"
            >
              <section.icon className="h-4 w-4" aria-hidden />
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="members" className="mt-0">
            <MembersPanel />
          </TabsContent>

          <TabsContent value="notifications" className="mt-0">
            <div className="grid gap-4">
              <SettingsCard
                icon={Video}
                title="New capture emails"
                description="Email me when a new capture in this workspace is ready to review."
                trailing={
                  <Switch
                    checked={notificationPreferences.emailOnNewCapture}
                    onCheckedChange={(value) =>
                      void handleNotificationPreferenceChange('emailOnNewCapture', value)
                    }
                    disabled={isNotificationLoading || savingNotificationKey !== null}
                    aria-label="Toggle new capture email notifications"
                    className={
                      savingNotificationKey === 'emailOnNewCapture' ? 'cursor-wait' : undefined
                    }
                  />
                }
                footer={
                  <NotificationPreferenceStatus
                    isLoading={isNotificationLoading}
                    isSaving={savingNotificationKey === 'emailOnNewCapture'}
                    syncState={notificationSyncState.emailOnNewCapture}
                    error={notificationSyncError.emailOnNewCapture}
                  />
                }
              />
              <SettingsCard
                icon={MessageSquareText}
                title="Comment emails"
                description="Email me when someone adds a comment to a capture in this workspace."
                trailing={
                  <Switch
                    checked={notificationPreferences.emailOnNewComment}
                    onCheckedChange={(value) =>
                      void handleNotificationPreferenceChange('emailOnNewComment', value)
                    }
                    disabled={isNotificationLoading || savingNotificationKey !== null}
                    aria-label="Toggle comment email notifications"
                    className={
                      savingNotificationKey === 'emailOnNewComment' ? 'cursor-wait' : undefined
                    }
                  />
                }
                footer={
                  <NotificationPreferenceStatus
                    isLoading={isNotificationLoading}
                    isSaving={savingNotificationKey === 'emailOnNewComment'}
                    syncState={notificationSyncState.emailOnNewComment}
                    error={notificationSyncError.emailOnNewComment}
                  />
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="mt-0">
            <SettingsCard
              icon={ShieldCheck}
              title="Redact sensitive data"
              description="Mask tokens, cookies, authorization headers, and obvious secrets before captures are displayed."
              trailing={
                <Switch
                  checked={redactSensitiveData}
                  onCheckedChange={(value) => void handleRedactionChange(value)}
                  disabled={isSaving}
                  aria-label="Toggle redaction"
                  className={isSaving ? 'cursor-wait' : undefined}
                />
              }
              footer={
                <div className="min-h-5">
                  {isSaving ? (
                    <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ink-muted)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Syncing to extension...
                    </p>
                  ) : syncState === 'synced' ? (
                    <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--success)]">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Synced. New captures will use this preference.
                    </p>
                  ) : syncState === 'failed' ? (
                    <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--danger)]">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {syncError ?? 'Could not sync to extension.'}
                    </p>
                  ) : null}
                </div>
              }
            />
          </TabsContent>

          <TabsContent value="shortcuts" className="mt-0">
            <ShortcutsTable />
          </TabsContent>

          <TabsContent value="about" className="mt-0">
            <Card className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-13 w-13 place-items-center rounded-xl bg-[var(--primary-subtle)]">
                    <WeevilMark size={48} tone="brand" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-[var(--ink)]">Weevil</h2>
                    <p className="font-mono text-xs text-[var(--ink-faint)]">Version 0.1.0</p>
                  </div>
                </div>
                <p className="mt-4 max-w-md text-sm leading-6 text-[var(--ink-muted)]">
                  Capture recordings, console logs, network activity, actions, and comments in one workspace.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  trailing,
  footer,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--primary-subtle)] text-[var(--primary)]">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--ink-muted)]">
                {description}
              </p>
            </div>
          </div>
          {trailing}
        </div>
        {footer ? <div className="mt-3 pl-[3.25rem]">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}

function NotificationPreferenceStatus({
  isLoading,
  isSaving,
  syncState,
  error,
}: {
  isLoading: boolean;
  isSaving: boolean;
  syncState: 'idle' | 'synced' | 'failed';
  error: string | null;
}) {
  return (
    <div className="min-h-5">
      {isLoading ? (
        <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ink-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading preference...
        </p>
      ) : isSaving ? (
        <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ink-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Saving preference...
        </p>
      ) : syncState === 'synced' ? (
        <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--success)]">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Saved for this workspace.
        </p>
      ) : syncState === 'failed' ? (
        <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--danger)]">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          {error ?? 'Could not save notification preference.'}
        </p>
      ) : null}
    </div>
  );
}

function ShortcutsTable() {
  const shortcuts = [
    { keys: ['⌘', 'K'], description: 'Open command palette' },
    { keys: ['J'], description: 'Next capture in inbox' },
    { keys: ['K'], description: 'Previous capture in inbox' },
    { keys: ['↵'], description: 'Open focused capture' },
    { keys: ['Esc'], description: 'Close detail / palette' },
    { keys: ['Space'], description: 'Play / pause recording (in capture detail)' },
  ];
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Keyboard shortcuts</CardTitle>
        <CardDescription>
          Weevil is keyboard-first. These work anywhere outside text inputs.
        </CardDescription>
      </CardHeader>
      <div className="divide-y divide-[var(--divider)]">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.description} className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-sm text-[var(--ink)]">{shortcut.description}</span>
            <div className="flex items-center gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 font-mono text-[11px] text-[var(--ink-muted)]"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
