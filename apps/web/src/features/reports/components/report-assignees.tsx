'use client';

import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from 'react';
import { Check, Loader2, Search, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toaster';
import { apiClient } from '@/lib/api/client';
import type { ReportAssignee, ReportSummary, WorkspaceMemberSummary } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useUpdateReportAssignees } from '../queries';

interface AssigneeAvatarStackProps {
  assignees: ReportAssignee[];
  maxVisible?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function AssigneeAvatarStack({
  assignees,
  maxVisible = 3,
  size = 'sm',
  className,
}: AssigneeAvatarStackProps) {
  if (assignees.length === 0) return null;

  const visible = assignees.slice(0, maxVisible);
  const overflow = assignees.length - visible.length;
  const sizeClass = size === 'md' ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[10px]';

  return (
    <span className={cn('inline-flex items-center', className)} aria-label={assigneeLabel(assignees)}>
      {visible.map((assignee, index) => {
        const label = displayName(assignee);
        return (
          <Tooltip
            key={assignee.id}
            content={
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-white/70">{assignee.email}</span>
              </span>
            }
            side="top"
            className={index > 0 ? '-ml-2' : undefined}
          >
            <Avatar
              className={cn(
                sizeClass,
                'rounded-full border-2 border-[var(--bg)] bg-[var(--primary-subtle)] ring-1 ring-[var(--border)]',
              )}
            >
              {assignee.avatarUrl ? (
                <AvatarImage src={assignee.avatarUrl} alt="" className="rounded-full object-cover" />
              ) : null}
              <AvatarFallback className="rounded-full bg-[var(--primary-subtle)] font-mono font-semibold uppercase text-[var(--primary)]">
                {initialsFor(label)}
              </AvatarFallback>
            </Avatar>
          </Tooltip>
        );
      })}
      {overflow > 0 ? (
        <Tooltip content={assignees.slice(maxVisible).map(displayName).join(', ')} side="top" className="-ml-2">
          <span
            className={cn(
              sizeClass,
              'grid place-items-center rounded-full border-2 border-[var(--bg)] bg-[var(--ink)] font-mono font-semibold text-white ring-1 ring-[var(--border)]',
            )}
          >
            +{overflow}
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}

interface AssigneeEditorPopoverProps {
  report: ReportSummary;
  canEdit: boolean;
  compact?: boolean;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function AssigneeEditorPopover({
  report,
  canEdit,
  compact = false,
  align = 'end',
  className,
}: AssigneeEditorPopoverProps) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<WorkspaceMemberSummary[] | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => report.assignees.map((assignee) => assignee.id));
  const updateAssignees = useUpdateReportAssignees();

  useEffect(() => {
    if (!open) {
      setSelectedIds(report.assignees.map((assignee) => assignee.id));
      setQuery('');
      return;
    }
    setSelectedIds(report.assignees.map((assignee) => assignee.id));
  }, [open, report.assignees]);

  useEffect(() => {
    if (!open || members) return;
    let isMounted = true;
    setIsLoadingMembers(true);
    setMemberError(null);
    apiClient
      .listMembers()
      .then((list) => {
        if (!isMounted) return;
        setMembers(list);
      })
      .catch((error) => {
        if (!isMounted) return;
        setMemberError(error instanceof Error ? error.message : 'Could not load members.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingMembers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [members, open]);

  const assignableMembers = useMemo(
    () =>
      (members ?? [])
        .filter((member) => member.status === 'ACTIVE' && member.userId)
        .filter((member) => {
          const haystack = `${member.displayName ?? ''} ${member.email}`.toLowerCase();
          return haystack.includes(query.trim().toLowerCase());
        }),
    [members, query],
  );
  const hasChanges = !sameStringSet(selectedIds, report.assignees.map((assignee) => assignee.id));

  if (!canEdit) {
    return <AssigneeAvatarStack assignees={report.assignees} size={compact ? 'sm' : 'md'} className={className} />;
  }

  async function handleSave() {
    try {
      await updateAssignees.mutateAsync({
        reportId: report.id,
        input: { assigneeUserIds: selectedIds },
      });
      setOpen(false);
      toast.success('Assignees updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update assignees.');
    }
  }

  function toggleUser(userId: string) {
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  return (
    <span
      className={cn('inline-flex', className)}
      onClick={stopPropagation}
      onPointerDown={stopPointerPropagation}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="secondary" size={compact ? 'sm' : 'sm'} className={compact ? 'h-7 gap-1.5 px-2' : 'h-8'}>
            {report.assignees.length > 0 ? (
              <AssigneeAvatarStack assignees={report.assignees} size="sm" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className={compact ? 'sr-only' : 'hidden sm:inline'}>
              {report.assignees.length > 0 ? 'Assignees' : 'Assign'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
          <div className="border-b border-[var(--divider)] p-3">
            <div className="text-sm font-semibold text-[var(--ink)]">Assign capture</div>
            <div className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
              Pick active members in this workspace.
            </div>
            <div className="relative mt-3">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 pl-8 text-sm"
                placeholder="Search members"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {isLoadingMembers ? (
              <div className="grid h-24 place-items-center font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                Loading members
              </div>
            ) : memberError ? (
              <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger)]">
                {memberError}
              </div>
            ) : assignableMembers.length === 0 ? (
              <div className="grid h-24 place-items-center text-center text-sm text-[var(--ink-muted)]">
                No active members found.
              </div>
            ) : (
              assignableMembers.map((member) => {
                const userId = member.userId!;
                const selected = selectedIds.includes(userId);
                const label = member.displayName || member.email;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleUser(userId)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                      selected ? 'bg-[var(--primary-subtle)]' : 'hover:bg-[var(--surface)]',
                    )}
                    aria-pressed={selected}
                  >
                    <Avatar className="h-8 w-8 rounded-full">
                      {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" className="rounded-full object-cover" /> : null}
                      <AvatarFallback className="rounded-full bg-[var(--ink)] font-mono text-[11px] font-semibold text-white">
                        {initialsFor(label)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--ink)]">{label}</span>
                      <span className="block truncate font-mono text-[10px] text-[var(--ink-faint)]">{member.email}</span>
                    </span>
                    <span
                      className={cn(
                        'grid h-5 w-5 place-items-center rounded-full border',
                        selected
                          ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                          : 'border-[var(--border)] text-transparent',
                      )}
                    >
                      <Check className="h-3 w-3" aria-hidden />
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--divider)] p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0 || updateAssignees.isPending}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={!hasChanges || updateAssignees.isPending}
            >
              {updateAssignees.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

function displayName(assignee: Pick<ReportAssignee, 'email' | 'displayName'>): string {
  return assignee.displayName?.trim() || assignee.email;
}

function assigneeLabel(assignees: ReportAssignee[]): string {
  return `Assigned to ${assignees.map(displayName).join(', ')}`;
}

function initialsFor(value: string): string {
  return (
    value
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function stopPropagation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopPointerPropagation(event: PointerEvent<HTMLElement>) {
  event.stopPropagation();
}
