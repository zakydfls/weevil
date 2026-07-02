'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Copy, Loader2, MoreHorizontal, Trash2, UserPlus, XCircle } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  requestKind?: 'MEMBER' | 'INVITE' | 'JOIN_REQUEST';
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
      await dialog.feedback({
        status: 'success',
        title: 'Invite sent',
        description: `${inviteEmail.trim()} was added as a pending invitation.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send invite.';
      setError(message);
      await dialog.feedback({
        status: 'error',
        title: 'Could not send invite',
        description: message,
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleChangeRole(memberId: string, role: string, label: string) {
    try {
      await apiClient.changeMemberRole(memberId, role);
      await refresh();
      await dialog.feedback({
        status: 'success',
        title: 'Role updated',
        description: `${label} is now ${role.toLowerCase()}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change role.';
      setError(message);
      await dialog.feedback({
        status: 'error',
        title: 'Could not update role',
        description: message,
      });
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
      await dialog.feedback({
        status: 'success',
        title: 'Member removed',
        description: `${label} no longer has access to this workspace.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove member.';
      setError(message);
      await dialog.feedback({
        status: 'error',
        title: 'Could not remove member',
        description: message,
      });
    }
  }

  async function handleApproveJoinRequest(memberId: string, label: string) {
    try {
      await apiClient.approveJoinRequest(memberId);
      await refresh();
      await dialog.feedback({
        status: 'success',
        title: 'Access approved',
        description: `${label} can now sign in and open this workspace.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve access request.';
      setError(message);
      await dialog.feedback({
        status: 'error',
        title: 'Could not approve request',
        description: message,
      });
    }
  }

  async function handleRejectJoinRequest(memberId: string, label: string) {
    const ok = await dialog.confirm({
      title: 'Reject access request?',
      description: (
        <>
          <strong className="text-[var(--ink)]">{label}</strong> will not be able to sign in to this workspace.
          They can request access again later.
        </>
      ),
      confirmLabel: 'Reject',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.rejectJoinRequest(memberId);
      await refresh();
      await dialog.feedback({
        status: 'success',
        title: 'Request rejected',
        description: `${label} was not added to this workspace.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject access request.';
      setError(message);
      await dialog.feedback({
        status: 'error',
        title: 'Could not reject request',
        description: message,
      });
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
        <Card className="overflow-hidden">
          <CardHeader className="grid-cols-[auto_1fr] items-center">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary-subtle)] text-[var(--primary)]">
              <UserPlus className="h-4 w-4" aria-hidden />
            </span>
            <CardTitle className="text-sm">Invite a member</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="grid gap-2 sm:grid-cols-[1fr_8.5rem_auto]">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
              />
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as (typeof ROLES)[number])}>
                <SelectTrigger className="font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role} className="font-mono text-xs uppercase">
                      {role.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={isInviting} className="h-9">
                {isInviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden bg-[var(--bg)]">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm">Members</CardTitle>
          <span className="font-mono text-[11px] text-[var(--ink-faint)]">
            {members.length} {members.length === 1 ? 'person' : 'people'}
          </span>
        </CardHeader>
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
                  canManageRoles &&
                  member.status === 'ACTIVE' &&
                  Boolean(member.userId) &&
                  member.userId !== auth.user?.id
                }
                canRemove={
                  canRemove &&
                  member.status === 'ACTIVE' &&
                  Boolean(member.userId) &&
                  member.userId !== auth.user?.id
                }
                canApproveJoinRequest={canInvite && member.requestKind === 'JOIN_REQUEST'}
                onChangeRole={(role) => handleChangeRole(member.id, role, member.displayName ?? member.email)}
                onRemove={() => handleRemove(member.id, member.displayName ?? member.email)}
                onApproveJoinRequest={() =>
                  handleApproveJoinRequest(member.id, member.displayName ?? member.email)
                }
                onRejectJoinRequest={() =>
                  handleRejectJoinRequest(member.id, member.displayName ?? member.email)
                }
                isSelf={member.userId === auth.user?.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MemberRow({
  member,
  canManageRoles,
  canRemove,
  canApproveJoinRequest,
  onChangeRole,
  onRemove,
  onApproveJoinRequest,
  onRejectJoinRequest,
  isSelf,
}: {
  member: Member;
  canManageRoles: boolean;
  canRemove: boolean;
  canApproveJoinRequest: boolean;
  onChangeRole: (role: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onApproveJoinRequest: () => Promise<void>;
  onRejectJoinRequest: () => Promise<void>;
  isSelf: boolean;
}) {
  const [copiedInvite, setCopiedInvite] = useState(false);
  const isJoinRequest = member.requestKind === 'JOIN_REQUEST';
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
        <Avatar className="h-9 w-9 rounded-full">
          <AvatarFallback className="rounded-full font-mono text-[11px] font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--ink)]">
              {member.displayName ?? member.email}
            </span>
            {isSelf ? (
              <Badge tone="info" className="h-5 px-1.5 font-mono text-[10px]">you</Badge>
            ) : null}
            {isPendingInvite ? (
              <Badge tone="warning" className="h-5 px-1.5 font-mono text-[10px]">pending invitation</Badge>
            ) : null}
            {isJoinRequest ? (
              <Badge tone="warning" className="h-5 px-1.5 font-mono text-[10px]">join request</Badge>
            ) : null}
          </div>
          <div className="truncate font-mono text-[11px] text-[var(--ink-faint)]">
            {member.email}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        {canApproveJoinRequest ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void onRejectJoinRequest()}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden />
              Reject
            </Button>
            <Button type="button" size="sm" onClick={() => void onApproveJoinRequest()}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Approve
            </Button>
          </>
        ) : null}
        {isPendingInvite && member.inviteUrl ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopyInvite()}>
            {copiedInvite ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedInvite ? 'Copied' : 'Copy link'}
          </Button>
        ) : null}
        {canManageRoles && !isPendingInvite && !isJoinRequest ? (
          <Select value={member.role} onValueChange={(value) => void onChangeRole(value)}>
            <SelectTrigger className="h-8 w-28 rounded-md px-2 font-mono text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role} className="font-mono text-xs uppercase">
                  {role.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            {member.role.toLowerCase()}
          </span>
        )}
        {canRemove && !isPendingInvite && !isJoinRequest ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] data-[state=open]:bg-[var(--primary-subtle)] data-[state=open]:text-[var(--primary)]"
                aria-label="More"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onSelect={() => {
                  void onRemove();
                }}
                className="text-xs text-[var(--danger)] focus:bg-[var(--danger-bg)] focus:text-[var(--danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
