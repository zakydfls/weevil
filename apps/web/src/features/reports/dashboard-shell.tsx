'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  KanbanSquare,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getExtensionStatus, startExtensionCapture, updateExtensionSettings } from '@/lib/extension-bridge';
import type { ReportSummary } from '@/lib/api/types';
import { useReportDetail, useReports } from './queries';
import { CaptureCardGrid } from './components/capture-card-grid';
import { CaptureDetailView } from './components/capture-detail-view';

const PAGE_SIZE_OPTIONS = [6, 12, 24] as const;
type DashboardView = 'captures' | 'share-links' | 'project-board' | 'privacy';

const DASHBOARD_VIEWS: DashboardView[] = ['captures', 'share-links', 'project-board', 'privacy'];
const DASHBOARD_PANEL_CLASS =
  'weevil-panel-in flex h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-2xl border border-[#e2e0dc] bg-white shadow-[0_2px_10px_rgba(16,24,40,0.06)] lg:h-[calc(100vh-1.5rem)]';
const PROJECT_BOARD_COLUMNS = [
  {
    id: 'draft',
    title: 'Draft',
    description: 'Fresh captures waiting for review.',
    statuses: ['DRAFT'],
    icon: FileText,
    accentClassName: 'from-[#dbeafe] to-[#eff6ff] text-[#2563eb] ring-[#bfdbfe]',
    borderClassName: 'border-t-[#2563eb]',
  },
  {
    id: 'processing',
    title: 'Processing',
    description: 'Uploads and telemetry still settling.',
    statuses: ['UPLOADING', 'PROCESSING'],
    icon: Clock3,
    accentClassName: 'from-[#fff7ed] to-[#fffbeb] text-[#ea580c] ring-[#fed7aa]',
    borderClassName: 'border-t-[#f97316]',
  },
  {
    id: 'ready',
    title: 'Ready',
    description: 'Complete reports ready to share.',
    statuses: ['READY'],
    icon: CheckCircle2,
    accentClassName: 'from-[#ecfdf5] to-[#f0fdfa] text-[#0f766e] ring-[#99f6e4]',
    borderClassName: 'border-t-[#14b8a6]',
  },
  {
    id: 'attention',
    title: 'Needs Attention',
    description: 'Failed or archived captures.',
    statuses: ['FAILED', 'ARCHIVED'],
    icon: AlertTriangle,
    accentClassName: 'from-[#fff1f2] to-[#fff7ed] text-[#e11d48] ring-[#fecdd3]',
    borderClassName: 'border-t-[#e11d48]',
  },
] as const;

function parseDashboardView(value: string | null): DashboardView {
  return DASHBOARD_VIEWS.includes(value as DashboardView) ? (value as DashboardView) : 'captures';
}

function readRedactionSetting(response: unknown) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return undefined;
  }

  const directSettings = (response as { settings?: unknown }).settings;
  const payload = (response as { payload?: unknown }).payload;
  const payloadSettings = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as { settings?: unknown }).settings
    : undefined;
  const settings = directSettings ?? payloadSettings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return undefined;
  }

  const value = (settings as { redactSensitiveData?: unknown }).redactSensitiveData;
  return typeof value === 'boolean' ? value : undefined;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function DashboardShell() {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>('captures');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [creatorFilter, setCreatorFilter] = useState('All');
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [isInviteCopied, setIsInviteCopied] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(6);
  const [redactSensitiveData, setRedactSensitiveData] = useState(true);
  const [isSavingRedaction, setIsSavingRedaction] = useState(false);
  const [redactionSyncState, setRedactionSyncState] = useState<'idle' | 'synced' | 'failed'>('idle');
  const [redactionSyncError, setRedactionSyncError] = useState<string | null>(null);
  const [captureStartError, setCaptureStartError] = useState<string | null>(null);
  const [isStartingCapture, setIsStartingCapture] = useState(false);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const reportListParams = useMemo(() => ({
    page: activeView === 'project-board' ? 1 : page,
    pageSize: activeView === 'project-board' ? 100 : pageSize,
    search: debouncedSearchTerm.trim() || undefined,
    source: sourceFilter === 'All' ? undefined : (sourceFilter.toUpperCase() as 'DASHBOARD' | 'EXTENSION' | 'API'),
    hasRecording: typeFilter === 'With video' ? true : typeFilter === 'No video' ? false : undefined,
  }), [activeView, debouncedSearchTerm, page, pageSize, sourceFilter, typeFilter]);
  const reportsQuery = useReports(reportListParams);
  const reports = reportsQuery.data?.items ?? [];
  const totalItems = reportsQuery.data?.total ?? 0;
  const totalPages = reportsQuery.data?.totalPages ?? 1;
  const detailQuery = useReportDetail(selectedReportId);

  useEffect(() => {
    function syncView() {
      const params = new URLSearchParams(window.location.search);
      const rawView = params.get('view');
      const view = parseDashboardView(rawView);
      if (rawView && rawView !== view) {
        const url = new URL(window.location.href);
        url.searchParams.set('view', view);
        window.history.replaceState(null, '', url.toString());
      }
      setActiveView(view);
      setSelectedReportId(null);
    }

    syncView();
    window.addEventListener('popstate', syncView);
    window.addEventListener('weevil:view-change', syncView);
    return () => {
      window.removeEventListener('popstate', syncView);
      window.removeEventListener('weevil:view-change', syncView);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [activeView, creatorFilter, pageSize, debouncedSearchTerm, sourceFilter, typeFilter]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const stored = window.localStorage.getItem('weevil.redact-sensitive-data');
    if (stored) {
      setRedactSensitiveData(stored === 'true');
    }
  }, []);

  useEffect(() => {
    if (activeView !== 'privacy') {
      return;
    }

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
        // The dashboard can still store the preference when the extension is not installed or not reloaded.
      }
    }

    void syncExtensionPrivacy();
    return () => {
      isMounted = false;
    };
  }, [activeView]);

  useEffect(() => {
    if (selectedReportId) {
      return;
    }

    const captureId = new URLSearchParams(window.location.search).get('capture');
    if (captureId) {
      setSelectedReportId(captureId);
    }
  }, [selectedReportId]);

  async function handleNewCapture() {
    setCaptureStartError(null);
    setIsStartingCapture(true);
    try {
      await startExtensionCapture({ redactSensitiveData });
    } catch (error) {
      setCaptureStartError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStartingCapture(false);
    }
  }

  function handleSelectReport(report: ReportSummary) {
    const url = new URL(window.location.href);
    url.searchParams.set('capture', report.id);
    window.history.replaceState(null, '', url.toString());
    setSelectedReportId(report.id);
  }

  function handleBackToList() {
    const url = new URL(window.location.href);
    url.searchParams.delete('capture');
    window.history.replaceState(null, '', url.toString());
    setSelectedReportId(null);
  }

  async function handleInvite() {
    await navigator.clipboard?.writeText(window.location.origin);
    setIsInviteCopied(true);
    window.setTimeout(() => setIsInviteCopied(false), 1_400);
  }

  async function handleRedactionChange(value: boolean) {
    const previousValue = redactSensitiveData;
    setRedactSensitiveData(value);
    setIsSavingRedaction(true);
    setRedactionSyncState('idle');
    setRedactionSyncError(null);
    window.localStorage.setItem('weevil.redact-sensitive-data', String(value));
    try {
      await updateExtensionSettings({ redactSensitiveData: value });
      setRedactionSyncState('synced');
    } catch (error) {
      setRedactSensitiveData(previousValue);
      window.localStorage.setItem('weevil.redact-sensitive-data', String(previousValue));
      setRedactionSyncState('failed');
      setRedactionSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingRedaction(false);
    }
  }

  if (selectedReportId) {
    return (
      <CaptureDetailView
        report={detailQuery.data}
        isLoading={detailQuery.isLoading}
        onBack={handleBackToList}
      />
    );
  }

  if (activeView === 'share-links') {
    return (
      <ShareLinksView
        reports={reports}
        isLoading={reportsQuery.isLoading}
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onOpenReport={handleSelectReport}
      />
    );
  }

  if (activeView === 'project-board') {
    return <ProjectBoardView reports={reports} isLoading={reportsQuery.isLoading} onOpenReport={handleSelectReport} />;
  }

  if (activeView === 'privacy') {
    return (
      <PrivacyView
        redactSensitiveData={redactSensitiveData}
        isSaving={isSavingRedaction}
        syncState={redactionSyncState}
        syncError={redactionSyncError}
        onRedactSensitiveDataChange={handleRedactionChange}
      />
    );
  }

  return (
    <section className={DASHBOARD_PANEL_CLASS}>
      <header className="flex min-h-24 shrink-0 flex-col items-start justify-between gap-4 border-b border-[#e7e5e0] px-5 py-5 sm:flex-row sm:items-center sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Captures</h1>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="hidden items-center -space-x-2 md:flex">
            {['W', 'Z', 'Q'].map((label, index) => (
              <div
                key={label}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-sm font-semibold ${
                  index === 0 ? 'bg-[#0f766e] text-white' : 'bg-[#eeeeec] text-[#8a8580]'
                }`}
              >
                {label}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-10 flex-1 rounded-xl px-4 text-sm sm:h-11 sm:flex-none sm:text-base"
            onClick={() => void handleInvite()}
          >
            {isInviteCopied ? <Check className="h-4 w-4" aria-hidden /> : null}
            {isInviteCopied ? 'Copied' : 'Invite'}
          </Button>
          <Button
            type="button"
            className="h-10 flex-1 rounded-xl bg-[#73e6c4] px-4 text-sm font-semibold text-[#10201b] hover:bg-[#64d9b7] sm:h-11 sm:flex-none sm:px-5 sm:text-base"
            onClick={() => void handleNewCapture()}
            disabled={isStartingCapture}
          >
            {isStartingCapture ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-5 w-5" aria-hidden />
            )}
            {isStartingCapture ? 'Starting' : 'New Capture'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-5 py-6 sm:px-8 sm:py-8">
        {captureStartError ? (
          <div className="weevil-fade-in rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-3 text-sm font-medium text-[#be123c]">
            {captureStartError}
          </div>
        ) : null}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-8 text-base text-[#5f5a55]">
            <FilterButton
              label="Type"
              value={typeFilter}
              options={['All', 'With video', 'No video']}
              isOpen={openFilter === 'Type'}
              onToggle={() => setOpenFilter(openFilter === 'Type' ? null : 'Type')}
              onSelect={(value) => {
                setTypeFilter(value);
                setOpenFilter(null);
              }}
            />
            <FilterButton
              label="Source"
              value={sourceFilter}
              options={['All', 'Dashboard', 'Extension', 'API']}
              isOpen={openFilter === 'Source'}
              onToggle={() => setOpenFilter(openFilter === 'Source' ? null : 'Source')}
              onSelect={(value) => {
                setSourceFilter(value);
                setOpenFilter(null);
              }}
            />
            <FilterButton
              label="Creator"
              value={creatorFilter}
              options={['All', 'Weevil']}
              isOpen={openFilter === 'Creator'}
              onToggle={() => setOpenFilter(openFilter === 'Creator' ? null : 'Creator')}
              onSelect={(value) => {
                setCreatorFilter(value);
                setOpenFilter(null);
              }}
            />
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#77736d]" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-11 rounded-xl border-[#d8d5cf] pl-10 text-base"
              placeholder="Search Captures"
            />
          </div>
        </div>

        <CaptureCardGrid
          reports={reports}
          isLoading={reportsQuery.isLoading}
          onSelect={handleSelectReport}
        />
        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </section>
  );
}

function PaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: (typeof PAGE_SIZE_OPTIONS)[number]) => void;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((candidate) => {
    if (totalPages <= 5) {
      return true;
    }

    return candidate === 1 || candidate === totalPages || Math.abs(candidate - page) <= 1;
  });

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-[#edf0f7] pt-4 text-sm text-[#64708a] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="font-medium text-[#16213a]">{start}-{end}</span>
        <span>of {totalItems}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#dbe4f6] bg-[#f8faff] p-1">
        <div className="mr-1 hidden items-center gap-1 border-r border-[#dbe4f6] pr-2 sm:flex">
          {PAGE_SIZE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPageSizeChange(option)}
              className={`h-7 rounded-lg px-2 text-xs font-semibold transition ${
                option === pageSize
                  ? 'bg-white text-[#1d4ed8] shadow-sm'
                  : 'text-[#64708a] hover:bg-white/80 hover:text-[#16213a]'
              }`}
              aria-pressed={option === pageSize}
            >
              {option}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>

        {pages.map((candidate, index) => {
          const previous = pages[index - 1];
          const needsGap = previous && candidate - previous > 1;

          return (
            <span key={candidate} className="flex items-center gap-1">
              {needsGap ? <span className="px-1 text-xs text-[#94a0b8]">...</span> : null}
              <button
                type="button"
                onClick={() => onPageChange(candidate)}
                className={`h-8 min-w-8 rounded-lg px-2 text-sm font-semibold transition ${
                  candidate === page
                    ? 'bg-[#2563eb] text-white shadow-sm'
                    : 'text-[#64708a] hover:bg-white hover:text-[#16213a]'
                }`}
                aria-current={candidate === page ? 'page' : undefined}
              >
                {candidate}
              </button>
            </span>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function FilterButton({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="relative">
      <button type="button" className="flex items-center gap-2 font-medium text-[#5f5a55]" onClick={onToggle}>
        {label}
        {value !== 'All' ? <span className="text-[#242321]">{value}</span> : null}
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-8 z-20 min-w-40 overflow-hidden rounded-xl border border-[#dfdcd7] bg-white p-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                option === value ? 'bg-[#eef8f4] text-[#0f766e]' : 'text-[#5f5a55] hover:bg-[#f7f7f6]'
              }`}
              onClick={() => onSelect(option)}
            >
              {option}
              {option === value ? <Check className="h-4 w-4" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ShareLinksView({
  reports,
  isLoading,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onOpenReport,
}: {
  reports: ReportSummary[];
  isLoading: boolean;
  page: number;
  pageSize: (typeof PAGE_SIZE_OPTIONS)[number];
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: (typeof PAGE_SIZE_OPTIONS)[number]) => void;
  onOpenReport: (report: ReportSummary) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyShareLink(report: ReportSummary) {
    const link = `${window.location.origin}/?capture=${report.id}`;
    await navigator.clipboard?.writeText(link);
    setCopiedId(report.id);
    window.setTimeout(() => setCopiedId(null), 1_300);
  }

  return (
    <section className={DASHBOARD_PANEL_CLASS}>
      <header className="shrink-0 border-b border-[#e7e5e0] px-8 py-6">
        <h1 className="text-3xl font-semibold tracking-normal">Share Links</h1>
        <p className="mt-1 text-sm text-[#64708a]">Manage report links that can be copied into chat, tickets, or issue trackers.</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#dfe5f5]">
          <div className="grid grid-cols-[1.3fr_1fr_auto] gap-4 border-b border-[#e8edf8] bg-[#f8faff] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#64708a]">
            <span>Capture</span>
            <span>Share URL</span>
            <span>Actions</span>
          </div>
          <div className="thin-scrollbar h-full overflow-auto">
            {isLoading ? (
              <div className="p-6 text-sm text-[#64708a]">Loading links...</div>
            ) : reports.length === 0 ? (
              <div className="p-6 text-sm text-[#64708a]">No share links yet.</div>
            ) : (
              reports.map((report) => {
                const link = `${typeof window === 'undefined' ? '' : window.location.origin}/?capture=${report.id}`;
                return (
                  <div key={report.id} className="weevil-card-hover grid grid-cols-[1.3fr_1fr_auto] items-center gap-4 border-b border-[#eef2fb] px-4 py-4 last:border-b-0 hover:bg-[#f8faff]">
                    <button type="button" className="min-w-0 text-left" onClick={() => onOpenReport(report)}>
                      <div className="truncate font-semibold text-[#16213a]">{report.title}</div>
                      <div className="mt-1 truncate text-sm text-[#64708a]">{report.pageUrl ?? report.id}</div>
                    </button>
                    <code className="truncate rounded-lg bg-[#f6f8fd] px-3 py-2 text-xs text-[#4b5875]">{link}</code>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => void copyShareLink(report)}>
                        <Copy className="h-4 w-4" aria-hidden />
                        {copiedId === report.id ? 'Copied' : 'Copy'}
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => onOpenReport(report)}>
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        Open
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>
    </section>
  );
}

function ProjectBoardView({
  reports,
  isLoading,
  onOpenReport,
}: {
  reports: ReportSummary[];
  isLoading: boolean;
  onOpenReport: (report: ReportSummary) => void;
}) {
  const totalReady = reports.filter((report) => report.status === 'READY').length;
  const totalIssues = reports.reduce((total, report) => total + (report.runtimeErrorCount ?? 0), 0);

  return (
    <section className={DASHBOARD_PANEL_CLASS}>
      <header className="shrink-0 border-b border-[#e7e5e0] bg-white px-5 py-5 sm:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#eef3ff] text-[#2563eb] ring-1 ring-[#dbe4f6]">
              <KanbanSquare className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-[#16213a]">Project Board</h1>
              <p className="mt-1 max-w-2xl text-sm text-[#64708a]">
                Triage captures by lifecycle status before sending them into engineering work.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:w-auto sm:min-w-[25rem]">
            <BoardMetric label="Captures" value={reports.length} />
            <BoardMetric label="Ready" value={totalReady} />
            <BoardMetric label="Errors" value={totalIssues} tone={totalIssues > 0 ? 'danger' : 'default'} />
          </div>
        </div>
      </header>
      <div className="thin-scrollbar grid min-h-0 flex-1 auto-cols-[minmax(19rem,1fr)] grid-flow-col gap-4 overflow-x-auto bg-[#f7f9ff] p-4 sm:p-6 xl:grid-flow-row xl:grid-cols-4">
        {PROJECT_BOARD_COLUMNS.map((column) => {
          const Icon = column.icon;
          const items = reports.filter((report) => (column.statuses as readonly string[]).includes(report.status));
          return (
            <div
              key={column.id}
              className={`weevil-panel-in flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#dfe5f5] border-t-4 bg-white shadow-sm ${column.borderClassName}`}
            >
              <div className="border-b border-[#edf1fb] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ${column.accentClassName}`}>
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-[#16213a]">{column.title}</h2>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#64708a]">{column.description}</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-[#dbe4f6] bg-[#f8faff] px-2 py-0.5 text-xs font-semibold text-[#4b5875]">
                    {items.length}
                  </span>
                </div>
              </div>
              <div className="thin-scrollbar min-h-0 flex-1 space-y-2.5 overflow-auto bg-[#fbfcff] p-2.5">
                {isLoading ? <BoardColumnSkeleton /> : null}
                {items.map((report) => (
                  <ProjectBoardCard key={report.id} report={report} onOpen={() => onOpenReport(report)} />
                ))}
                {!isLoading && items.length === 0 ? <BoardEmptyState title={column.title} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BoardMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone === 'danger' ? 'border-[#fecdd3] bg-[#fff1f2]' : 'border-[#dbe4f6] bg-[#f8faff]'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${tone === 'danger' ? 'text-[#be123c]' : 'text-[#64708a]'}`}>
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold text-[#16213a]">{value}</div>
    </div>
  );
}

function ProjectBoardCard({ report, onOpen }: { report: ReportSummary; onOpen: () => void }) {
  const hasErrors = (report.runtimeErrorCount ?? 0) > 0;
  const isArchived = report.status === 'ARCHIVED';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="weevil-card-hover weevil-fade-in w-full rounded-xl border border-[#e3e9f8] bg-white p-3 text-left shadow-sm hover:border-[#bfdbfe] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${hasErrors ? 'bg-[#e11d48]' : 'bg-[#14b8a6]'}`} />
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[#16213a]">{report.title}</h3>
          </div>
          <p className="mt-2 truncate text-xs text-[#64708a]">{report.pageUrl ?? report.id}</p>
        </div>
        <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusPillClass(report.status)}`}>
          {shortStatus(report.status)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <BoardCardStat label="Net" value={report.networkRequestCount ?? 0} />
        <BoardCardStat label="Act" value={report.actionCount ?? 0} />
        <BoardCardStat label="Err" value={report.runtimeErrorCount ?? 0} tone={hasErrors ? 'danger' : 'default'} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#64708a]">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {isArchived ? <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span className="truncate">{report.source}</span>
        </span>
        <time className="shrink-0">{formatBoardDate(report.updatedAt)}</time>
      </div>
    </button>
  );
}

function BoardCardStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${tone === 'danger' ? 'bg-[#fff1f2] text-[#be123c]' : 'bg-[#f3f6ff] text-[#4b5875]'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function BoardColumnSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-xl border border-[#e7ecf8] bg-white" />
      ))}
    </>
  );
}

function BoardEmptyState({ title }: { title: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-[#dbe4f6] bg-white/70 p-4 text-center">
      <div>
        <div className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-[#eef3ff] text-[#64708a]">
          <CheckCircle2 className="h-4.5 w-4.5" aria-hidden />
        </div>
        <p className="mt-2 text-sm font-medium text-[#4b5875]">No {title.toLowerCase()} captures</p>
        <p className="mt-1 text-xs text-[#8a96ad]">New reports will appear here automatically.</p>
      </div>
    </div>
  );
}

function statusPillClass(status: ReportSummary['status']) {
  if (status === 'READY') {
    return 'bg-[#ecfdf5] text-[#0f766e]';
  }

  if (status === 'FAILED') {
    return 'bg-[#fff1f2] text-[#be123c]';
  }

  if (status === 'PROCESSING' || status === 'UPLOADING') {
    return 'bg-[#fff7ed] text-[#c2410c]';
  }

  if (status === 'ARCHIVED') {
    return 'bg-[#f1f5f9] text-[#475569]';
  }

  return 'bg-[#eff6ff] text-[#1d4ed8]';
}

function shortStatus(status: ReportSummary['status']) {
  if (status === 'UPLOADING') {
    return 'Upload';
  }

  if (status === 'PROCESSING') {
    return 'Process';
  }

  return status.toLowerCase();
}

function formatBoardDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function PrivacyView({
  redactSensitiveData,
  isSaving,
  syncState,
  syncError,
  onRedactSensitiveDataChange,
}: {
  redactSensitiveData: boolean;
  isSaving: boolean;
  syncState: 'idle' | 'synced' | 'failed';
  syncError: string | null;
  onRedactSensitiveDataChange: (value: boolean) => Promise<void>;
}) {
  return (
    <section className={DASHBOARD_PANEL_CLASS}>
      <header className="shrink-0 border-b border-[#e7e5e0] px-5 py-5 sm:px-7">
        <h1 className="text-2xl font-semibold tracking-normal">Privacy</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#64708a]">Control how sensitive values are handled before captures are shared.</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-5 sm:px-7">
        <div className="max-w-3xl">
        <div className="weevil-card-hover rounded-xl border border-[#dfe5f5] bg-[#f8faff] p-4 hover:border-[#c8d7f5]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#dbeafe] text-[#2563eb]">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#16213a]">Redact sensitive data</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[#64708a]">
                  Mask tokens, cookies, authorization headers, and obvious secrets when captures are displayed.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRedactSensitiveDataChange(!redactSensitiveData)}
              disabled={isSaving}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
                redactSensitiveData ? 'bg-[#2563eb]' : 'bg-[#cbd5e1]'
              } ${isSaving ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
              aria-pressed={redactSensitiveData}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  redactSensitiveData ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
        <div className="mt-3 min-h-5">
          {isSaving ? (
            <p className="inline-flex items-center gap-2 text-xs font-medium text-[#64708a]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Syncing privacy setting to the browser extension...
            </p>
          ) : syncState === 'synced' ? (
            <p className="inline-flex items-center gap-2 text-xs font-medium text-[#0f766e]">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Synced to extension. New captures will use this preference.
            </p>
          ) : syncState === 'failed' ? (
            <p className="inline-flex items-center gap-2 text-xs font-medium text-[#be123c]">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {syncError ?? 'Could not sync privacy setting to the extension.'}
            </p>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-[#64708a]">
          Extension captures use this preference at recording time. Data that was already stored while redaction was enabled stays redacted.
        </p>
        </div>
      </div>
    </section>
  );
}
