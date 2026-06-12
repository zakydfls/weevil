'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, LayoutGrid, Loader2, Rows3, ShieldCheck, Users } from 'lucide-react';
import { WeevilMark } from '@/components/brand/weevil-mark';
import { MembersPanel } from '@/features/auth/members-panel';
import { getExtensionStatus, updateExtensionSettings } from '@/lib/extension-bridge';
import { PageHeader } from './components/page-chrome';

type SettingsSection = 'members' | 'privacy' | 'shortcuts' | 'about';

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
  const [activeSection, setActiveSection] = useState<SettingsSection>('members');
  const [redactSensitiveData, setRedactSensitiveData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'synced' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

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

  const sections = [
    { id: 'members' as const, label: 'Members', icon: Users },
    { id: 'privacy' as const, label: 'Privacy', icon: ShieldCheck },
    { id: 'shortcuts' as const, label: 'Shortcuts', icon: Rows3 },
    { id: 'about' as const, label: 'About', icon: LayoutGrid },
  ];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-5xl flex-col">
      <PageHeader title="Settings" subtitle="Workspace preferences, integrations, and shortcuts." />
      <div className="grid flex-1 gap-6 px-4 pb-10 sm:px-6 md:gap-8 md:grid-cols-[12rem_1fr]">
        <nav
          className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-[var(--border)] px-4 pb-3 sm:-mx-6 sm:px-6 md:mx-0 md:flex-col md:gap-0.5 md:space-y-0 md:overflow-visible md:border-b-0 md:p-0"
          aria-label="Settings sections"
        >
          {sections.map((section) => {
            const active = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full ${
                  active
                    ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary)]'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
                }`}
              >
                <section.icon className="h-4 w-4" aria-hidden />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div>
          {activeSection === 'members' ? <MembersPanel /> : null}

          {activeSection === 'privacy' ? (
            <SettingsCard
              icon={ShieldCheck}
              title="Redact sensitive data"
              description="Mask tokens, cookies, authorization headers, and obvious secrets before captures are displayed."
              trailing={
                <button
                  type="button"
                  onClick={() => handleRedactionChange(!redactSensitiveData)}
                  disabled={isSaving}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
                    redactSensitiveData ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'
                  } ${isSaving ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
                  aria-pressed={redactSensitiveData}
                  aria-label="Toggle redaction"
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200 ease-out ${
                      redactSensitiveData ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
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
          ) : null}

          {activeSection === 'shortcuts' ? <ShortcutsTable /> : null}

          {activeSection === 'about' ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex items-center gap-3">
                <WeevilMark size={48} tone="brand" />
                <div>
                  <h2 className="text-base font-semibold text-[var(--ink)]">Weevil</h2>
                  <p className="font-mono text-xs text-[var(--ink-faint)]">0.1.0 · forensic-workbench</p>
                </div>
              </div>
              <p className="mt-4 max-w-md text-sm leading-6 text-[var(--ink-muted)]">
                Weevil turns a bug report into a debuggable session. Capture once, share once, fix faster.
              </p>
            </div>
          ) : null}
        </div>
      </div>
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--primary-subtle)] text-[var(--primary)]">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
          </div>
        </div>
        {trailing}
      </div>
      {footer ? <div className="mt-3 pl-13">{footer}</div> : null}
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-5 py-3">
        <h2 className="text-base font-semibold text-[var(--ink)]">Keyboard shortcuts</h2>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
          Weevil is keyboard-first. These work anywhere outside text inputs.
        </p>
      </div>
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
    </div>
  );
}
