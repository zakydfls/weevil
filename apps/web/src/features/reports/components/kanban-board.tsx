'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { WeevilMark } from '@/components/brand/weevil-mark';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import type { ReportStatus, ReportSummary } from '@/lib/api/types';
import { StatusBadge } from './status-badge';

interface KanbanBoardProps {
  reports: ReportSummary[];
  isLoading: boolean;
  onOpenReport: (report: ReportSummary) => void;
  /**
   * Persist a report's column assignment. The parent should update the report's status (or
   * a side-table mapping) to remember the move across reloads. If omitted, moves are local-only.
   */
  onMoveReport?: (reportId: string, toColumnId: string, toIndex: number) => void | Promise<void>;
}

/**
 * Icon registry — columns store an `iconKey` (string) instead of the component itself,
 * so the board can survive a JSON round-trip through localStorage. Functions don't
 * serialize; if we stored the component directly we'd get `{}` back after reload and
 * the render would crash with "Element type is invalid".
 */
const ICON_REGISTRY = {
  backlog: FileText,
  progress: Clock3,
  review: AlertTriangle,
  done: CheckCircle2,
  default: FileText,
} as const;

type IconKey = keyof typeof ICON_REGISTRY;

function resolveIcon(key: string | undefined): typeof FileText {
  return (key && ICON_REGISTRY[key as IconKey]) || ICON_REGISTRY.default;
}

interface BoardColumn {
  id: string;
  title: string;
  /** When non-empty, reports with these statuses auto-populate this column on first load. */
  statuses: ReportStatus[];
  accent: string;
  iconKey: IconKey;
  description: string;
}

// v3 — separates persisted user customizations (columns/placements/order) from derived
// in-memory state. Bumped from v2 so old stale entries that contained the now-wiped
// `assignments` don't poison the new schema.
const STORAGE_KEY = 'weevil.board.config.v3';

const DEFAULT_COLUMNS: BoardColumn[] = [
  {
    id: 'backlog',
    title: 'Backlog',
    statuses: ['DRAFT'],
    accent: 'var(--accent-cool)',
    iconKey: 'backlog',
    description: 'New captures, not triaged yet.',
  },
  {
    id: 'in-progress',
    title: 'In progress',
    statuses: ['UPLOADING', 'PROCESSING'],
    accent: 'var(--primary)',
    iconKey: 'progress',
    description: 'Being investigated or processed.',
  },
  {
    id: 'review',
    title: 'In review',
    statuses: [],
    accent: 'var(--spark-deep)',
    iconKey: 'review',
    description: 'Awaiting confirmation or QA review.',
  },
  {
    id: 'done',
    title: 'Done',
    statuses: ['READY'],
    accent: 'var(--success)',
    iconKey: 'done',
    description: 'Fixed and verified.',
  },
];

const FALLBACK_COLUMN_ID = 'backlog';
const NEW_COLUMN_DESCRIPTION = 'Describe when a capture belongs here.';

/**
 * What lives in localStorage: only what the user has explicitly customized.
 * - `columns`: column definitions if user added/removed/renamed any (defaults if untouched)
 * - `placements`: reportId → columnId for every card the user has dragged
 * - `order`: columnId → ordered reportIds for cards the user has reordered
 *
 * The full in-memory `BoardState.assignments` is DERIVED from
 * (reports + placements + order + status fallback) on every render. We never
 * persist `assignments` directly — that would conflict with reports loading
 * asynchronously (initial empty `reports` would clobber the persisted placements).
 */
interface PersistedBoard {
  version: 2;
  columns: BoardColumn[] | null;
  placements: Record<string, string>;
  order: Record<string, string[]>;
}

interface BoardState {
  columns: BoardColumn[];
  /** Per-column ordered list of report IDs — derived, NOT persisted. */
  assignments: Record<string, string[]>;
  /** reportId → columnId — derived, NOT persisted. */
  byReportId: Record<string, string>;
}

function loadPersisted(): PersistedBoard {
  const empty: PersistedBoard = { version: 2, columns: null, placements: {}, order: {} };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    return {
      version: 2,
      columns: Array.isArray(parsed.columns) ? parsed.columns : null,
      placements:
        parsed.placements && typeof parsed.placements === 'object' ? parsed.placements : {},
      order: parsed.order && typeof parsed.order === 'object' ? parsed.order : {},
    };
  } catch {
    return empty;
  }
}

function savePersisted(persisted: PersistedBoard) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // ignore quota / privacy mode errors
  }
}

/**
 * Derive the in-memory state from the canonical inputs:
 * reports (server) + columns + placements (user) + order (user).
 *
 * Pure function — same inputs always produce the same output. Safe to call
 * repeatedly without losing data, including when `reports` is empty during load.
 */
function deriveState(reports: ReportSummary[], persisted: PersistedBoard): BoardState {
  const columns = persisted.columns?.length ? persisted.columns : DEFAULT_COLUMNS;
  const validColumnIds = new Set(columns.map((c) => c.id));
  const assignments: Record<string, string[]> = {};
  const byReportId: Record<string, string> = {};
  columns.forEach((column) => {
    assignments[column.id] = [];
  });

  // First, place each report into its column (placement → status fallback → backlog).
  const unplacedByColumn: Record<string, ReportSummary[]> = {};
  reports.forEach((report) => {
    const placed = persisted.placements[report.id];
    let columnId: string | undefined;
    if (placed && validColumnIds.has(placed)) {
      columnId = placed;
    } else {
      const match = columns.find((column) =>
        column.statuses.includes(report.status as ReportStatus),
      );
      columnId =
        match?.id ?? columns.find((c) => c.id === FALLBACK_COLUMN_ID)?.id ?? columns[0]?.id;
    }
    if (!columnId) return;
    byReportId[report.id] = columnId;
    (unplacedByColumn[columnId] ??= []).push(report);
  });

  // Then for each column, order by persisted order if present (skipping reports that vanished),
  // then append anything the user hasn't manually positioned, newest first.
  columns.forEach((column) => {
    const orderForColumn = persisted.order[column.id] ?? [];
    const remaining = new Set((unplacedByColumn[column.id] ?? []).map((r) => r.id));
    const ordered: string[] = [];
    for (const id of orderForColumn) {
      if (remaining.has(id)) {
        ordered.push(id);
        remaining.delete(id);
      }
    }
    const leftover = (unplacedByColumn[column.id] ?? [])
      .filter((r) => remaining.has(r.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((r) => r.id);
    assignments[column.id] = [...ordered, ...leftover];
  });

  return { columns, assignments, byReportId };
}

export function KanbanBoard({ reports, isLoading, onOpenReport, onMoveReport }: KanbanBoardProps) {
  // Persisted user customizations — the SINGLE source of truth across reloads.
  const [persisted, setPersisted] = useState<PersistedBoard>(loadPersisted);
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  // Derived state — recomputed whenever reports or persisted change.
  const state = useMemo<BoardState>(() => deriveState(reports, persisted), [reports, persisted]);
  const reportMap = useMemo(() => new Map(reports.map((report) => [report.id, report])), [reports]);

  // Persist only when persisted itself changes (i.e., the user did something).
  // Skip the very first run so we don't write the same object back.
  const persistInitialRef = useRef(true);
  useEffect(() => {
    if (persistInitialRef.current) {
      persistInitialRef.current = false;
      return;
    }
    savePersisted(persisted);
  }, [persisted]);

  const moveReport = useCallback(
    (reportId: string, toColumnId: string, toIndex: number) => {
      setPersisted((current) => {
        const fromColumnId = state.byReportId[reportId];
        const nextPlacements = { ...current.placements, [reportId]: toColumnId };
        const nextOrder: Record<string, string[]> = {};
        // Recompute order for source + target columns.
        state.columns.forEach((column) => {
          if (column.id === toColumnId) {
            const without = state.assignments[column.id].filter((id) => id !== reportId);
            const clamped = Math.max(0, Math.min(toIndex, without.length));
            const next = [...without];
            next.splice(clamped, 0, reportId);
            nextOrder[column.id] = next;
          } else if (column.id === fromColumnId) {
            nextOrder[column.id] = state.assignments[column.id].filter((id) => id !== reportId);
          } else {
            // Preserve existing order for untouched columns.
            const existing = current.order[column.id];
            if (existing) nextOrder[column.id] = existing;
          }
        });
        if (fromColumnId !== toColumnId) {
          void onMoveReport?.(reportId, toColumnId, toIndex);
        }
        return { ...current, placements: nextPlacements, order: nextOrder };
      });
    },
    [state, onMoveReport],
  );

  const updateColumns = useCallback((updater: (columns: BoardColumn[]) => BoardColumn[]) => {
    setPersisted((current) => {
      const base = current.columns?.length ? current.columns : DEFAULT_COLUMNS;
      const nextColumns = updater(base);
      const knownIds = new Set(nextColumns.map((c) => c.id));
      // Drop placements / order keys that reference deleted columns.
      const nextPlacements: Record<string, string> = {};
      Object.entries(current.placements).forEach(([reportId, columnId]) => {
        nextPlacements[reportId] = knownIds.has(columnId) ? columnId : nextColumns[0]?.id ?? columnId;
      });
      const nextOrder: Record<string, string[]> = {};
      Object.entries(current.order).forEach(([columnId, ids]) => {
        if (knownIds.has(columnId)) nextOrder[columnId] = ids;
      });
      return { ...current, columns: nextColumns, placements: nextPlacements, order: nextOrder };
    });
  }, []);

  const createColumn = useCallback(
    (title: string, description: string) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) return;
      const trimmedDescription = description.trim();
      updateColumns((columns) => [
        ...columns,
        {
          id: `col-${Date.now()}`,
          title: trimmedTitle,
          statuses: [],
          accent: 'var(--ink-muted)',
          iconKey: 'default',
          description: trimmedDescription || NEW_COLUMN_DESCRIPTION,
        },
      ]);
      setIsAddingColumn(false);
    },
    [updateColumns],
  );

  const totalReports = reports.length;
  const totalErrors = useMemo(
    () => reports.reduce((total, report) => total + (report.runtimeErrorCount ?? 0), 0),
    [reports],
  );

  return (
    // Height-bounded to the viewport with overflow-hidden so ONLY the columns
    // area scrolls — the page never scrolls on the board. Mobile subtracts the
    // 3.5rem header + 3.5rem bottom-nav + 4rem section padding (11rem); desktop
    // only the 3.5rem header.
    <div className="mx-auto flex h-[calc(100dvh-11rem)] w-full min-w-0 max-w-[100rem] flex-col overflow-hidden sm:h-[calc(100dvh-3.5rem)]">
      <BoardHeader
        totalReports={totalReports}
        totalErrors={totalErrors}
        onAddColumn={() => setIsAddingColumn(true)}
        onReset={() => {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(STORAGE_KEY);
          }
          setPersisted({ version: 2, columns: null, placements: {}, order: {} });
        }}
      />

      <div className="thin-scrollbar flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:px-6">
        {state.columns.map((column) => (
          <BoardColumnView
            key={column.id}
            column={column}
            reportIds={state.assignments[column.id] ?? []}
            reportMap={reportMap}
            isLoading={isLoading}
            onOpenReport={onOpenReport}
            onDropReport={(reportId, toIndex) => moveReport(reportId, column.id, toIndex)}
            onUpdateColumn={(patch) => {
              updateColumns((columns) =>
                columns.map((c) => (c.id === column.id ? { ...c, ...patch } : c)),
              );
            }}
            onDeleteColumn={() => {
              if (state.columns.length <= 1) return;
              updateColumns((columns) => columns.filter((c) => c.id !== column.id));
            }}
            canDelete={state.columns.length > 1}
          />
        ))}
        {isAddingColumn ? (
          <AddColumnForm
            onSubmit={createColumn}
            onCancel={() => setIsAddingColumn(false)}
          />
        ) : (
          <AddColumnTile onClick={() => setIsAddingColumn(true)} />
        )}
      </div>
    </div>
  );
}

function BoardHeader({
  totalReports,
  totalErrors,
  onAddColumn,
  onReset,
}: {
  totalReports: number;
  totalErrors: number;
  onAddColumn: () => void;
  onReset: () => void;
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-3 px-4 pb-4 pt-6 sm:flex-row sm:items-end sm:px-6 sm:pb-5 sm:pt-8">
      <div>
        <h1 className="weevil-page-title text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)]">Board</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Drag captures across columns. Columns are customizable and persist locally.
        </p>
      </div>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
        <div className="flex items-center gap-4 font-mono text-[11px] text-[var(--ink-faint)]">
          <span>
            <span className="font-semibold text-[var(--ink)]">{totalReports}</span> total
          </span>
          {totalErrors > 0 ? (
            <span className="text-[var(--danger)]">
              <span className="font-semibold">{totalErrors}</span> errors
            </span>
          ) : null}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onReset}>
          Reset board
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={onAddColumn}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Column
        </Button>
      </div>
    </header>
  );
}

interface BoardColumnViewProps {
  column: BoardColumn;
  reportIds: string[];
  reportMap: Map<string, ReportSummary>;
  isLoading: boolean;
  onOpenReport: (report: ReportSummary) => void;
  onDropReport: (reportId: string, toIndex: number) => void;
  onUpdateColumn: (patch: Partial<BoardColumn>) => void;
  onDeleteColumn: () => void;
  canDelete: boolean;
}

function BoardColumnView({
  column,
  reportIds,
  reportMap,
  isLoading,
  onOpenReport,
  onDropReport,
  onUpdateColumn,
  onDeleteColumn,
  canDelete,
}: BoardColumnViewProps) {
  const Icon = resolveIcon(column.iconKey);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  const [descriptionDraft, setDescriptionDraft] = useState(column.description);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTitleDraft(column.title);
  }, [column.title]);

  useEffect(() => {
    setDescriptionDraft(column.description);
  }, [column.description]);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== column.title) {
      onUpdateColumn({ title: trimmed });
    } else {
      setTitleDraft(column.title);
    }
    setIsEditingTitle(false);
  }

  function commitDetails() {
    const nextTitle = titleDraft.trim() || column.title;
    const nextDescription = descriptionDraft.trim();
    onUpdateColumn({
      title: nextTitle,
      description: nextDescription,
    });
    setTitleDraft(nextTitle);
    setDescriptionDraft(nextDescription);
    setIsEditingTitle(false);
    setIsMenuOpen(false);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes('application/x-weevil-report')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setIsDraggingOver(true);
      const indicator = computeDropIndex(event.clientY, listRef.current);
      setDropIndicatorIndex(indicator);
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (
      event.currentTarget.contains(event.relatedTarget as Node) ||
      event.relatedTarget === null
    ) {
      // Still inside this column
      return;
    }
    setIsDraggingOver(false);
    setDropIndicatorIndex(null);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const reportId = event.dataTransfer.getData('application/x-weevil-report');
    if (!reportId) return;
    const toIndex = dropIndicatorIndex ?? reportIds.length;
    onDropReport(reportId, toIndex);
    setIsDraggingOver(false);
    setDropIndicatorIndex(null);
  }

  const renderedReports = reportIds
    .map((id) => reportMap.get(id))
    .filter((report): report is ReportSummary => Boolean(report));

  return (
    <div
      className={`weevil-panel-in flex min-h-0 w-[20rem] shrink-0 flex-col overflow-hidden rounded-xl border bg-[var(--surface-elevated)] transition-colors ${
        isDraggingOver ? 'border-[var(--primary)]' : 'border-[var(--border)]'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="flex items-start gap-2.5 border-b border-[var(--border)] bg-[var(--surface-elevated)] p-3"
        style={{ boxShadow: `inset 0 3px 0 0 ${column.accent}` }}
      >
        <div
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--bg)]"
          style={{ backgroundColor: column.accent }}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTitle();
                } else if (event.key === 'Escape') {
                  setTitleDraft(column.title);
                  setIsEditingTitle(false);
                }
              }}
              className="w-full rounded-md border-0 bg-[var(--surface)] px-1.5 py-0.5 text-sm font-semibold text-[var(--ink)] outline-none ring-1 ring-[var(--primary)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTitle(true)}
              className="block w-full truncate rounded-md px-0.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface)]"
              title="Click to rename"
            >
              {column.title}
            </button>
          )}
          {column.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
              {column.description}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="mt-1 rounded-md text-left text-xs text-[var(--primary)] hover:underline"
            >
              Add description
            </button>
          )}
        </div>
        <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--ink-muted)]">
          {renderedReports.length}
        </span>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            aria-label="Column options"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          {isMenuOpen ? (
            <div className="absolute right-0 top-9 z-[var(--z-dropdown)] w-72 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 shadow-[0_18px_46px_-24px_rgba(26,29,18,0.42)]">
              <form
                className="space-y-2.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  commitDetails();
                }}
              >
                <div className="space-y-1">
                  <label htmlFor={`column-title-${column.id}`} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Title
                  </label>
                  <Input
                    id={`column-title-${column.id}`}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    className="h-8 text-xs"
                    maxLength={42}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`column-description-${column.id}`} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Description
                  </label>
                  <Textarea
                    id={`column-description-${column.id}`}
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    className="min-h-20 resize-none text-xs leading-5"
                    maxLength={160}
                    placeholder="What belongs in this lane?"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button type="submit" variant="primary" size="sm" className="h-8">
                    Save details
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(column.title);
                      setDescriptionDraft(column.description);
                      setIsMenuOpen(false);
                    }}
                    className="rounded-md px-2 py-1 text-xs text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
              <div className="my-2 border-t border-[var(--border)]" />
              <ColorPicker
                value={column.accent}
                onChange={(accent) => {
                  onUpdateColumn({ accent });
                }}
              />
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteColumn();
                    setIsMenuOpen(false);
                  }}
                  className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete column
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={listRef}
        className="thin-scrollbar relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-[var(--surface)] p-2"
      >
        {isLoading ? <ColumnSkeleton /> : null}
        {renderedReports.map((report, index) => (
          <KanbanCard
            key={report.id}
            report={report}
            isAfterDropIndicator={dropIndicatorIndex === index}
            onOpen={() => onOpenReport(report)}
          />
        ))}
        {dropIndicatorIndex === renderedReports.length ? (
          <DropIndicator />
        ) : null}
        {!isLoading && renderedReports.length === 0 ? (
          <ColumnEmptyState title={column.title} />
        ) : null}
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const palette = [
    { name: 'terracotta', value: 'var(--primary)' },
    { name: 'teal', value: 'var(--accent-cool)' },
    { name: 'success', value: 'var(--success)' },
    { name: 'danger', value: 'var(--danger)' },
    { name: 'amber', value: 'var(--warning)' },
    { name: 'ink', value: 'var(--ink)' },
    { name: 'muted', value: 'var(--ink-muted)' },
  ];
  return (
    <div className="px-1.5 py-1">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
        Accent
      </div>
      <div className="flex flex-wrap gap-1">
        {palette.map((swatch) => {
          const isActive = swatch.value === value;
          return (
            <button
              key={swatch.name}
              type="button"
              onClick={() => onChange(swatch.value)}
              className="grid h-5 w-5 place-items-center rounded-full ring-offset-2 ring-offset-[var(--bg)] transition-transform hover:scale-110"
              style={{ backgroundColor: swatch.value, boxShadow: isActive ? '0 0 0 1.5px var(--ink)' : undefined }}
              title={swatch.name}
            >
              {isActive ? <Check className="h-3 w-3 text-white" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  report,
  isAfterDropIndicator,
  onOpen,
}: {
  report: ReportSummary;
  isAfterDropIndicator: boolean;
  onOpen: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const hasErrors = (report.runtimeErrorCount ?? 0) > 0;
  const isArchived = report.status === 'ARCHIVED';

  return (
    <>
      {isAfterDropIndicator ? <DropIndicator /> : null}
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-weevil-report', report.id);
          event.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
        }}
        onDragEnd={() => setIsDragging(false)}
        className={`weevil-card-hover weevil-fade-in group relative rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 transition-opacity ${
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
          className="block w-full pl-3 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: hasErrors ? 'var(--danger)' : 'var(--success)' }}
                />
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--ink)]">{report.title}</h3>
              </div>
              <p className="mt-1.5 truncate font-mono text-[11px] text-[var(--ink-faint)]">
                {report.pageUrl ?? report.id}
              </p>
              {report.description ? (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
                  {report.description}
                </p>
              ) : null}
            </div>
            <StatusBadge status={report.status} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <CardStat label="net" value={report.networkRequestCount ?? 0} />
            <CardStat label="act" value={report.actionCount ?? 0} />
            <CardStat
              label="err"
              value={report.runtimeErrorCount ?? 0}
              tone={hasErrors ? 'danger' : 'default'}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[11px] text-[var(--ink-faint)]">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {isArchived ? (
                <Archive className="h-3 w-3 shrink-0" aria-hidden />
              ) : null}
              <span className="truncate">{report.source.toLowerCase()}</span>
            </span>
            <time>{formatBoardDate(report.updatedAt)}</time>
          </div>
        </button>
      </div>
    </>
  );
}

function CardStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <div
      className={`rounded-md px-2 py-1.5 font-mono ${
        tone === 'danger' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' : 'bg-[var(--surface)] text-[var(--ink-muted)]'
      }`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wider opacity-75">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--bg)]" />
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
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">drop here</p>
      </div>
    </div>
  );
}

function AddColumnForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string, description: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('New column');
  const [description, setDescription] = useState('');
  const canSubmit = title.trim().length > 0;

  return (
    <form
      className="weevil-panel-in flex w-[20rem] shrink-0 flex-col rounded-xl border border-[var(--primary)] bg-[var(--surface-elevated)] p-3 shadow-[0_18px_46px_-28px_rgba(26,29,18,0.5)]"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          onSubmit(title, description);
        }
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">New column</h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Name the lane and define what belongs here.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          aria-label="Cancel new column"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1">
          <label htmlFor="new-column-title" className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            Title
          </label>
          <Input
            id="new-column-title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={42}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-column-description" className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            Description
          </label>
          <Textarea
            id="new-column-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-24 resize-none"
            maxLength={160}
            placeholder="Example: awaiting QA confirmation, ready for release, blocked by backend."
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add column
        </Button>
      </div>
    </form>
  );
}

function AddColumnTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="weevil-panel-in grid w-[14rem] shrink-0 place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-subtle)] hover:text-[var(--ink)]"
    >
      <div className="flex flex-col items-center gap-2 px-6 py-8">
        <Plus className="h-5 w-5" aria-hidden />
        <span className="font-mono text-[11px] uppercase tracking-wider">add column</span>
      </div>
    </button>
  );
}

function DropIndicator() {
  return <div className="my-1 h-0.5 rounded-full bg-[var(--primary)]" aria-hidden />;
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
