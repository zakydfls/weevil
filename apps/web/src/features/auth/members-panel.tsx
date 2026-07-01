'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, MoreHorizontal, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api/client';
import { useAuth } from './auth-context';

interface Member {
  id: string;
  userId: string | null;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  expiresAt?: string;
  inviteUrl?: string;
}

const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;

export function MembersPanel() {
  const auth = useAuth();
  const dialog = useDialog();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>('MEMBER');
  const [isInviting, setIsInviting] = useState(false);

  const canInvite = auth.can('MEMBER_INVITE');
  const canManageRoles = auth.can('MEMBER_ROLE_UPDATE');
  const canRemove = auth.can('MEMBER_REMOVE');

  async function refresh() {
    setIsLoading(true);
    setError(null);
    try {
      const list = await apiClient.listMembers();
      setMembers(list as Member[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    setError(null);
    try {
      await apiClient.inviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setIsInviting(false);
    }
  }

  async function handleChangeRole(memberId: string, role: string) {
    try {
      await apiClient.changeMemberRole(memberId, role);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role.');
    }
  }

  async function handleRemove(memberId: string, label: string) {
    const ok = await dialog.confirm({
      title: 'Remove member?',
      description: (
        <>
          <strong className="text-[var(--ink)]">{label}</strong> will lose access to this workspace.
          You can re-invite them later.
        </>
      ),
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.removeMember(memberId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member.');
    }
  }

  const sorted = useMemo(() => {
    const order = { OWNER: 0, ADMIN: 1, MEMBER: 2, VIEWER: 3 } as const;
    return [...members].sort((a, b) => {
      const statusA = a.status === 'INVITED' ? 1 : 0;
      const statusB = b.status === 'INVITED' ? 1 : 0;
      if (statusA !== statusB) return statusA - statusB;
      return (
        (order[a.role as keyof typeof order] ?? 99) - (order[b.role as keyof typeof order] ?? 99)
      );
    });
  }, [members]);

  return (
    <div className="space-y-6">
      {canInvite ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[var(--primary)]" aria-hidden />
            <h2 className="text-sm font-semibold text-[var(--ink)]">Invite a member</h2>
          </div>
          <form onSubmit={handleInvite} className="mt-4 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 font-mono text-xs text-[var(--ink)]"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.toLowerCase()}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={isInviting} className="h-9">
              {isInviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Send invite
            </Button>
          </form>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Members</h2>
          <span className="font-mono text-[11px] text-[var(--ink-faint)]">
            {members.length} {members.length === 1 ? 'person' : 'people'}
          </span>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-14 animate-pulse rounded-md bg-[var(--surface)]" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-[var(--divider)]">
            {sorted.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                canManageRoles={
                  canManageRoles && Boolean(member.userId) && member.userId !== auth.user?.id
                }
                canRemove={canRemove && Boolean(member.userId) && member.userId !== auth.user?.id}
                onChangeRole={(role) => handleChangeRole(member.id, role)}
                onRemove={() => handleRemove(member.id, member.displayName ?? member.email)}
                isSelf={member.userId === auth.user?.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  canManageRoles,
  canRemove,
  onChangeRole,
  onRemove,
  isSelf,
}: {
  member: Member;
  canManageRoles: boolean;
  canRemove: boolean;
  onChangeRole: (role: string) => Promise<void>;
  onRemove: () => Promise<void>;
  isSelf: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const isPendingInvite = member.status === 'INVITED' && !member.userId;
  const initials = (member.displayName ?? member.email).slice(0, 2).toUpperCase();

  async function handleCopyInvite() {
    if (!member.inviteUrl) return;
    await navigator.clipboard.writeText(member.inviteUrl);
    setCopiedInvite(true);
    window.setTimeout(() => setCopiedInvite(false), 1400);
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-mono text-[11px] font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--ink)]">
              {member.displayName ?? member.email}
            </span>
            {isSelf ? (
              <span className="rounded bg-[var(--primary-subtle)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--primary)]">
                you
              </span>
            ) : null}
            {isPendingInvite ? (
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                pending invitation
              </span>
            ) : null}
          </div>
          <div className="truncate font-mono text-[11px] text-[var(--ink-faint)]">
            {member.email}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        {isPendingInvite && member.inviteUrl ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopyInvite()}>
            {copiedInvite ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedInvite ? 'Copied' : 'Copy link'}
          </Button>
        ) : null}
        {canManageRoles && !isPendingInvite ? (
          <select
            value={member.role}
            onChange={(e) => void onChangeRole(e.target.value)}
            className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 font-mono text-[11px] text-[var(--ink)]"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role.toLowerCase()}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            {member.role.toLowerCase()}
          </span>
        )}
        {canRemove && !isPendingInvite ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((v) => !v)}
              onBlur={() => window.setTimeout(() => setIsMenuOpen(false), 150)}
              className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              aria-label="More"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
            {isMenuOpen ? (
              <div className="absolute right-0 top-9 z-[var(--z-dropdown)] w-44 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-[0_8px_24px_-12px_rgba(26,29,18,0.18)]">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void onRemove();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remove member
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
