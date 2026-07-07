'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  GripVertical,
  ListTodo,
  MessageSquare,
  MousePointer2,
  Network,
  Plus,
  SearchCheck,
  type LucideIcon,
} from 'lucide-react';
import { WeevilMark } from '@/components/brand/weevil-mark';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { Input, Textarea } from '@/components/ui/input';
import type { CreateReportBoardColumnInput, ReportBoardColumn, ReportSummary } from '@/lib/api/types';
import { AssigneeEditorPopover } from './report-assignees';
import { StatusBadge } from './status-badge';

interface KanbanBoardProps {
  reports: ReportSummary[];
  columns: ReportBoardColumn[];
  isLoading: boolean;
  areColumnsLoading?: boolean;
  isError?: boolean;
  canManageBoardColumns?: boolean;
  isCreatingColumn?: boolean;
  onRetry?: () => void;
  onOpenReport: (report: ReportSummary) => void;
  onMoveReport?: (reportId: string, toColumnId: string, toIndex: number) => void | Promise<void>;
  onCreateColumn?: (input: CreateReportBoardColumnInput) => void | Promise<unknown>;
  canEditAssignees?: (report: ReportSummary) => boolean;
}

interface BoardColumn {
  id: string;
  key: string;
  title: string;
  description: string | null;
  color: string;
  icon: LucideIcon;
  accent: string;
}

const DEFAULT_COLUMN_ID = 'backlog';

const FALLBACK_BOARD_COLUMNS: BoardColumn[] = [
  {
    id: 'backlog',
    key: 'backlog',
    title: 'Backlog',
    description: 'Fresh captures land here until someone triages them.',
    color: 'cool',
    icon: FileText,
    accent: 'var(--accent-cool)',
  },
  {
    id: 'in-progress',
    key: 'in-progress',
    title: 'In progress',
    description: 'Actively being investigated or fixed.',
    color: 'primary',
    icon: Clock3,
    accent: 'var(--primary)',
  },
  {
    id: 'review',
    key: 'review',
    title: 'Review',
    description: 'Needs QA, product, or engineering confirmation.',
    color: 'warning',
    icon: SearchCheck,
    accent: 'var(--warning)',
  },
  {
    id: 'done',
    key: 'done',
    title: 'Done',
    description: 'Resolved and verified.',
    color: 'success',
    icon: CheckCircle2,
    accent: 'var(--success)',
  },
];

export function KanbanBoard({
  reports,
  columns,
  isLoading,
  areColumnsLoading,
  isError,
  canManageBoardColumns,
  isCreatingColumn,
  onRetry,
  onOpenReport,
  onMoveReport,
  onCreateColumn,
  canEditAssignees,
}: KanbanBoardProps) {
  const [isAddStateOpen, setIsAddStateOpen] = useState(false);
  const boardColumns = useMemo(() => toBoardColumns(columns), [columns]);
  const groupedReports = useMemo(() => groupReports(reports, boardColumns), [reports, boardColumns]);
  const totalErrors = useMemo(
    () => reports.reduce((total, report) => total + (report.runtimeErrorCount ?? 0), 0),
    [reports],
  );
  const showColumnSkeletons = isLoading || Boolean(areColumnsLoading && columns.length === 0);

  if (isError && reports.length === 0) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-11rem)] w-full min-w-0 max-w-[100rem] flex-col sm:h-[calc(100dvh-3.5rem)]">
        <BoardHeader totalReports={0} totalErrors={0} />
        <div className="grid flex-1 place-items-center px-4 sm:px-6">
          <div className="w-full max-w-md">
            <ErrorState
              title="Couldn’t load the board"
              description="We couldn’t reach the workspace. Check your connection and try again."
              onRetry={onRetry}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-11rem)] w-full min-w-0 max-w-[100rem] flex-col overflow-hidden sm:h-[calc(100dvh-3.5rem)]">
      <BoardHeader
        totalReports={reports.length}
        totalErrors={totalErrors}
        canAddState={Boolean(canManageBoardColumns && onCreateColumn)}
        onAddState={() => setIsAddStateOpen(true)}
      />
      <div className="thin-scrollbar flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:px-6">
        {boardColumns.map((column) => (
          <BoardColumnView
            key={column.id}
            column={column}
            reports={groupedReports[column.key] ?? []}
            isLoading={showColumnSkeletons}
            onOpenReport={onOpenReport}
            canEditAssignees={canEditAssignees}
            onDropReport={(reportId, toIndex) => {
              void onMoveReport?.(reportId, column.key, toIndex);
            }}
          />
        ))}
      </div>
      <AddStateDialog
        open={isAddStateOpen}
        isSubmitting={Boolean(isCreatingColumn)}
        onOpenChange={setIsAddStateOpen}
        onCreateColumn={onCreateColumn}
      />
    </div>
  );
}

function BoardHeader({
  totalReports,
  totalErrors,
  canAddState,
  onAddState,
}: {
  totalReports: number;
  totalErrors: number;
  canAddState?: boolean;
  onAddState?: () => void;
}) {
  return (
    <header className="px-4 pb-4 pt-6 sm:px-6 sm:pb-5 sm:pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="weevil-page-title text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Board
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
            Triage captures as a workspace. Every new recording starts in Backlog, then moves only when a teammate moves it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAddState ? (
            <Button type="button" variant="secondary" size="sm" onClick={onAddState}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add state
            </Button>
          ) : null}
          <BoardSignal label="Captures" value={totalReports} tone="neutral" />
          <BoardSignal
            label="Errors"
            value={totalErrors}
            tone={totalErrors > 0 ? 'danger' : 'neutral'}
          />
        </div>
      </div>
    </header>
  );
}

function AddStateDialog({
  open,
  isSubmitting,
  onOpenChange,
  onCreateColumn,
}: {
  open: boolean;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateColumn?: (input: CreateReportBoardColumnInput) => void | Promise<unknown>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleValue = title.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onCreateColumn || !titleValue) return;

    setError(null);
    try {
      await onCreateColumn({
        title: titleValue,
        description: description.trim() || undefined,
      });
      setTitle('');
      setDescription('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create board state.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add board state</DialogTitle>
            <DialogDescription>
              Create a workspace lane for captures that need a separate triage step.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-4 pb-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--ink)]">State name</span>
              <Input
                value={title}
                maxLength={80}
                placeholder="Blocked"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--ink)]">Description</span>
              <Textarea
                value={description}
                maxLength={160}
                placeholder="Captures waiting on another team or dependency."
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {error ? (
              <p className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!titleValue || isSubmitting}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {isSubmitting ? 'Adding...' : 'Add state'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BoardSignal({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'neutral' | 'danger';
}) {
  const toneClass = {
    neutral: 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--ink-muted)]',
    danger: 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]',
  }[tone];

  return (
    <div className={`flex items-baseline gap-2 rounded-lg border px-3 py-2 ${toneClass}`}>
      <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function BoardColumnView({
  column,
  reports,
  isLoading,
  onOpenReport,
  canEditAssignees,
  onDropReport,
}: {
  column: BoardColumn;
  reports: ReportSummary[];
  isLoading: boolean;
  onOpenReport: (report: ReportSummary) => void;
  canEditAssignees?: (report: ReportSummary) => boolean;
  onDropReport: (reportId: string, toIndex: number) => void;
}) {
  const Icon = column.icon;
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const columnErrors = reports.reduce((total, report) => total + (report.runtimeErrorCount ?? 0), 0);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes('application/x-weevil-report')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setIsDraggingOver(true);
      setDropIndicatorIndex(computeDropIndex(event.clientY, listRef.current));
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node) || event.relatedTarget === null) {
      return;
    }
    setIsDraggingOver(false);
    setDropIndicatorIndex(null);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const reportId = event.dataTransfer.getData('application/x-weevil-report');
    if (!reportId) return;
    onDropReport(reportId, dropIndicatorIndex ?? reports.length);
    setIsDraggingOver(false);
    setDropIndicatorIndex(null);
  }

  return (
    <section
      className={`flex min-h-0 w-[min(21rem,calc(100vw-2rem))] shrink-0 flex-col overflow-hidden rounded-xl border bg-[var(--surface-elevated)] transition-colors ${
        isDraggingOver
          ? 'border-[var(--primary)] bg-[var(--primary-subtle)]'
          : 'border-[var(--border)]'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)] p-3">
        <div className="flex items-start gap-2.5">
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
            style={{ backgroundColor: column.accent }}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-sm font-semibold text-[var(--ink)]">{column.title}</h2>
              <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--ink-muted)]">
                {reports.length}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
              {column.description}
            </p>
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        className="thin-scrollbar relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-[var(--surface)] p-2.5"
      >
        {!isLoading && reports.length > 0 ? (
          <div className="mb-2 flex items-center justify-between gap-2 px-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            <span>{columnErrors > 0 ? `${columnErrors} errors` : 'clear lane'}</span>
            <span>{reports.reduce((total, report) => total + (report.commentCount ?? 0), 0)} comments</span>
          </div>
        ) : null}
        {isLoading ? <ColumnSkeleton /> : null}
        {reports.map((report, index) => (
          <KanbanCard
            key={report.id}
            report={report}
            isAfterDropIndicator={dropIndicatorIndex === index}
            onOpen={() => onOpenReport(report)}
            canEditAssignees={canEditAssignees?.(report) ?? false}
          />
        ))}
        {dropIndicatorIndex === reports.length ? <DropIndicator /> : null}
        {!isLoading && reports.length === 0 ? <ColumnEmptyState title={column.title} /> : null}
      </div>
    </section>
  );
}

function KanbanCard({
  report,
  isAfterDropIndicator,
  onOpen,
  canEditAssignees,
}: {
  report: ReportSummary;
  isAfterDropIndicator: boolean;
  onOpen: () => void;
  canEditAssignees: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const hasErrors = (report.runtimeErrorCount ?? 0) > 0;
  const reporterName = report.reporter?.displayName || report.reporter?.email || 'Unknown reporter';
  const reporterInitials = initialsFor(reporterName);
  const host = formatHost(report.pageUrl);

  return (
    <>
      {isAfterDropIndicator ? <DropIndicator /> : null}
      <article
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-weevil-report', report.id);
          event.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
        }}
        onDragEnd={() => setIsDragging(false)}
        className={`weevil-card-hover group relative rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 transition-opacity ${
          isDragging ? 'opacity-40' : ''
        }`}
      >
        <div
          className="pointer-events-none absolute left-1.5 top-2 text-[var(--ink-faint)] opacity-0 transition-opacity group-hover:opacity-60"
          aria-hidden
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="block w-full pl-3 text-left focus-visible:outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full ring-4 ring-[var(--surface)]"
                  style={{ backgroundColor: hasErrors ? 'var(--danger)' : 'var(--success)' }}
                />
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--ink)]">
                  {report.title}
                </h3>
              </div>
            </div>
            <StatusBadge status={report.status} />
          </div>

          <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg bg-[var(--surface)] px-2 py-1.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--primary-subtle)] font-mono text-[10px] font-semibold text-[var(--primary)]">
              {reporterInitials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-[var(--ink)]">{reporterName}</div>
              <div className="truncate font-mono text-[10px] text-[var(--ink-faint)]">
                {host ?? report.id}
              </div>
            </div>
          </div>

          {report.description ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
              {report.description}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <CardStat icon={Network} label="net" value={report.networkRequestCount ?? 0} />
            <CardStat icon={MousePointer2} label="act" value={report.actionCount ?? 0} />
            <CardStat
              icon={AlertTriangle}
              label="err"
              value={report.runtimeErrorCount ?? 0}
              tone={hasErrors ? 'danger' : 'default'}
            />
            <CardStat icon={MessageSquare} label="com" value={report.commentCount ?? 0} />
          </div>
        </button>
        <div className="mt-3 flex items-center justify-between gap-2 pl-3">
          <AssigneeEditorPopover
            report={report}
            canEdit={canEditAssignees}
            compact
            align="start"
          />
          <div className="min-w-0 flex items-center gap-2 font-mono text-[11px] text-[var(--ink-faint)]">
            <span className="truncate">{report.source.toLowerCase()}</span>
            <span aria-hidden>·</span>
            <time>{formatBoardDate(report.updatedAt)}</time>
          </div>
        </div>
      </article>
    </>
  );
}

function CardStat({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Network;
  label: string;
  value: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <div
      className={`rounded-md px-2 py-1.5 font-mono ${
        tone === 'danger'
          ? 'bg-[var(--danger-bg)] text-[var(--danger)]'
          : 'bg-[var(--surface)] text-[var(--ink-muted)]'
      }`}
    >
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider opacity-75">
        <Icon className="h-2.5 w-2.5" aria-hidden />
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--bg)]"
        />
      ))}
    </>
  );
}

function ColumnEmptyState({ title }: { title: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)]/60 p-4 text-center">
      <div>
        <WeevilMark size={28} tone="muted" className="mx-auto opacity-60" />
        <p className="mt-2 text-xs font-medium text-[var(--ink-muted)]">No {title.toLowerCase()}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          Drop captures here
        </p>
      </div>
    </div>
  );
}

function DropIndicator() {
  return <div className="my-1 h-0.5 rounded-full bg-[var(--primary)]" aria-hidden />;
}

function toBoardColumns(columns: ReportBoardColumn[]): BoardColumn[] {
  if (columns.length === 0) return FALLBACK_BOARD_COLUMNS;

  return columns.map((column) => ({
    id: column.id,
    key: column.key,
    title: column.title,
    description: column.description ?? null,
    color: column.color,
    icon: iconForColumn(column.key),
    accent: accentForColumnColor(column.color),
  }));
}

function iconForColumn(key: string): LucideIcon {
  if (key === 'backlog') return FileText;
  if (key === 'in-progress') return Clock3;
  if (key === 'review') return SearchCheck;
  if (key === 'done') return CheckCircle2;
  return ListTodo;
}

function accentForColumnColor(color: string): string {
  const accents: Record<string, string> = {
    cool: 'var(--accent-cool)',
    primary: 'var(--primary)',
    warning: 'var(--warning)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    neutral: 'var(--ink-muted)',
  };
  return accents[color] ?? accents.primary;
}

function groupReports(reports: ReportSummary[], columns: BoardColumn[]): Record<string, ReportSummary[]> {
  const grouped: Record<string, ReportSummary[]> = {};
  for (const column of columns) {
    grouped[column.key] = [];
  }
  const validColumnIds = new Set(columns.map((column) => column.key));
  const defaultColumnId = columns[0]?.key ?? DEFAULT_COLUMN_ID;

  for (const report of reports) {
    const columnId = validColumnIds.has(report.boardColumn) ? report.boardColumn : defaultColumnId;
    grouped[columnId].push(report);
  }

  for (const column of columns) {
    grouped[column.key].sort(compareBoardReports);
  }

  return grouped;
}

function compareBoardReports(a: ReportSummary, b: ReportSummary) {
  const aOrder = typeof a.boardOrder === 'number' ? a.boardOrder : Number.MAX_SAFE_INTEGER;
  const bOrder = typeof b.boardOrder === 'number' ? b.boardOrder : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function computeDropIndex(clientY: number, container: HTMLElement | null): number | null {
  if (!container) return null;
  const cards = Array.from(container.querySelectorAll<HTMLElement>('[draggable="true"]'));
  if (cards.length === 0) return 0;
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) return i;
  }
  return cards.length;
}

function formatBoardDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function initialsFor(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'W'
  );
}
