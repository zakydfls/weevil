'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Textarea } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { apiClient } from '@/lib/api/client';
import type { WorkspaceMemberSummary } from '@/lib/api/types';

export function CommentMentionInput({ value, onChange, onSubmit, disabled }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const auth = useAuth();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const mention = value.slice(0, caret).match(/(?:^|[\s(])@([^\s]*)$/);
  const query = mention?.[1].toLowerCase() ?? '';
  const open = Boolean(mention && !dismissed && !disabled);
  const members = useQuery({
    queryKey: ['comment-mention-members', auth.workspace?.id],
    queryFn: () => apiClient.listMembers(),
    enabled: open && Boolean(auth.workspace?.id),
    staleTime: 60_000,
  });
  const candidates = (members.data ?? []).filter((member) =>
    member.status === 'ACTIVE' && member.userId && member.userId !== auth.user?.id &&
    `${member.displayName ?? ''} ${member.email}`.toLowerCase().includes(query),
  ).slice(0, 8);
  const selectedIndex = Math.min(activeIndex, Math.max(0, candidates.length - 1));

  function insertMention(member: WorkspaceMemberSummary) {
    const start = caret - (mention?.[1].length ?? 0) - 1;
    const token = `@${member.email} `;
    onChange(`${value.slice(0, start)}${token}${value.slice(caret)}`);
    setDismissed(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(start + token.length, start + token.length);
      setCaret(start + token.length);
    });
  }

  return (
    <div className="relative min-w-0 flex-1">
      <Textarea
        ref={inputRef}
        value={value}
        disabled={disabled}
        maxLength={4000}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setActiveIndex(0);
          setDismissed(false);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setDismissed(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (open && event.key === 'Escape') {
            event.preventDefault();
            setDismissed(true);
          } else if (open && candidates.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            setActiveIndex((selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length);
          } else if (open && candidates.length && event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            insertMention(candidates[selectedIndex]);
          } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && value.trim() && !disabled) {
            event.preventDefault();
            onSubmit();
          }
        }}
        aria-label="Comment"
        aria-controls={open ? 'comment-mention-options' : undefined}
        aria-activedescendant={open && candidates.length ? `comment-mention-${selectedIndex}` : undefined}
        className="min-h-24 w-full border-0 p-0 text-sm shadow-none focus:ring-0"
        placeholder="Write a comment, paste a fix, or @mention…"
      />
      {open ? (
        <div id="comment-mention-options" role="listbox" aria-label="Mention a workspace member" className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
          {members.isLoading ? <p role="status" className="px-3 py-2 text-xs text-[var(--ink-muted)]">Loading members…</p>
            : members.isError ? <button type="button" onClick={() => void members.refetch()} className="w-full px-3 py-2 text-left text-xs text-[var(--danger)]">Could not load members. Click to retry.</button>
            : candidates.length === 0 ? <p role="status" className="px-3 py-2 text-xs text-[var(--ink-muted)]">No other active members found.</p>
            : candidates.map((member, index) => (
              <button key={member.id} id={`comment-mention-${index}`} type="button" role="option" aria-selected={index === selectedIndex}
                onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(member)}
                className={`block w-full rounded-md px-3 py-2 text-left hover:bg-[var(--primary-subtle)] ${index === selectedIndex ? 'bg-[var(--primary-subtle)]' : ''}`}>
                <span className="block truncate text-sm font-medium text-[var(--ink)]">{member.displayName || member.email}</span>
                <span className="block truncate text-xs text-[var(--ink-muted)]">{member.email}</span>
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export function CommentBody({ body }: { body: string }) {
  return <>{body.split(/(@[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi).map((part, index) =>
    index % 2 ? <span key={index} className="rounded bg-[var(--primary-subtle)] px-0.5 font-medium text-[var(--primary)]">{part}</span> : part,
  )}</>;
}
