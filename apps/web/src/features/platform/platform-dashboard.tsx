'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Loader2,
  Pause,
  Play,
  Search,
  Shield,
  ShieldCheck,
  TrendingUp,
  Users as UsersIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient } from '@/lib/api/client';

const capturesChartConfig = {
  count: { label: 'Captures', color: 'var(--primary)' },
} satisfies ChartConfig;

type Tab = 'overview' | 'tenants' | 'users';

interface Overview {
  generatedAt: string;
  counts: {
    workspaces: { total: number; active: number };
    users: { total: number; active: number };
    reports: { total: number; last30Days: number; prev30Days: number };
    activeSessionsLast30Days: number;
  };
  growth: { newWorkspaces30: number; newUsers30: number; reportGrowthPct: number | null };
  timeline: { capturesByDay: Array<{ day: string; count: number }> };
}

interface ActivityItem {
  type: 'capture';
  id: string;
  title: string;
  status: string;
  createdAt: string;
  workspace: { id: string; slug: string; name: string };
  createdBy: { email: string; displayName: string | null } | null;
}

interface Workspace {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
  memberCount: number;
  reportCount: number;
  projectCount: number;
}

interface PlatformUser {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  platformRole: string;
  createdAt: string;
  sessionCount: number;
  workspaces: Array<{ id: string; slug: string; name: string; role: string }>;
}

export function PlatformDashboard() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-[100rem] flex-col"
    >
      <header className="flex flex-col items-start justify-between gap-3 px-4 pb-2 pt-6 sm:flex-row sm:items-end sm:px-6 sm:pt-8">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
            platform admin
          </div>
          <h1 className="weevil-page-title mt-1 text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Cross-tenant control
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Operate every tenant on this Weevil instance — view analytics, suspend tenants, manage users.
          </p>
        </div>
      </header>

      <div className="border-b border-[var(--border)] px-4 sm:px-6">
        <TabsList className="scrollbar-none h-auto justify-start overflow-x-auto rounded-none border-0 bg-transparent p-0">
          {[
            { id: 'overview' as const, label: 'Overview', icon: TrendingUp },
            { id: 'tenants' as const, label: 'Tenants', icon: Building2 },
            { id: 'users' as const, label: 'Users', icon: UsersIcon },
          ].map((entry) => (
              <TabsTrigger
                key={entry.id}
                value={entry.id}
                className="group relative h-10 rounded-b-none rounded-t-md border-x-0 border-t-0 bg-transparent px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <entry.icon className="h-3.5 w-3.5" aria-hidden />
                {entry.label}
                <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-[var(--primary)] opacity-0 transition-opacity group-data-[state=active]:opacity-100" />
              </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="flex-1 px-4 pb-10 pt-6 sm:px-6">
        <TabsContent value="overview" className="mt-0"><OverviewTab /></TabsContent>
        <TabsContent value="tenants" className="mt-0"><TenantsTab /></TabsContent>
        <TabsContent value="users" className="mt-0"><UsersTab /></TabsContent>
      </div>
    </Tabs>
  );
}

function OverviewTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [overviewResp, activityResp] = await Promise.all([
          apiClient.platformOverview(),
          apiClient.platformRecentActivity(),
        ]);
        if (!cancelled) {
          setOverview(overviewResp);
          setActivity(activityResp);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load overview.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!overview) return null;

  const growth = overview.growth.reportGrowthPct;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icon={Building2}
          label="Tenants"
          value={overview.counts.workspaces.total}
          subValue={`${overview.counts.workspaces.active} active`}
          accent="primary"
        />
        <StatTile
          icon={UsersIcon}
          label="Users"
          value={overview.counts.users.total}
          subValue={`${overview.counts.users.active} active`}
          accent="accent"
        />
        <StatTile
          icon={Activity}
          label="Captures (30d)"
          value={overview.counts.reports.last30Days}
          subValue={
            growth === null
              ? `${overview.counts.reports.total} total`
              : `${growth > 0 ? '+' : ''}${growth}% vs prev`
          }
          subTone={growth === null ? 'muted' : growth >= 0 ? 'success' : 'danger'}
          accent="cool"
        />
        <StatTile
          icon={Shield}
          label="Sessions (30d)"
          value={overview.counts.activeSessionsLast30Days}
          subValue={`${overview.growth.newUsers30} new users`}
          accent="spark"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <CapturesChart data={overview.timeline.capturesByDay} />
        <RecentActivity items={activity} />
      </div>
    </div>
  );
}

type StatAccent = 'primary' | 'accent' | 'cool' | 'spark';

function StatTile({
  icon: Icon,
  label,
  value,
  subValue,
  subTone = 'muted',
  accent = 'primary',
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  subValue: string;
  subTone?: 'muted' | 'success' | 'danger';
  accent?: StatAccent;
}) {
  const accentStyles: Record<StatAccent, { bg: string; fg: string; ring: string }> = {
    primary: { bg: 'var(--primary-subtle)', fg: 'var(--primary)', ring: 'var(--primary-soft)' },
    accent: { bg: 'var(--success-bg)', fg: 'var(--success)', ring: 'var(--success-bg)' },
    cool: { bg: 'var(--accent-cool-soft)', fg: 'var(--accent-cool)', ring: 'var(--accent-cool-soft)' },
    spark: { bg: 'var(--spark-soft)', fg: 'var(--spark-deep)', ring: 'var(--spark-soft)' },
  };
  const a = accentStyles[accent];
  const toneClass =
    subTone === 'success'
      ? 'text-[var(--success)]'
      : subTone === 'danger'
        ? 'text-[var(--danger)]'
        : 'text-[var(--ink-faint)]';
  return (
    <Card className="relative overflow-hidden bg-[var(--bg)]">
      {/* Subtle accent corner — only ~20% of the tile, just enough to vary the eye */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-60"
        style={{ background: `radial-gradient(closest-side, ${a.ring}, transparent)` }}
        aria-hidden
      />
      <CardContent className="relative p-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span
            className="grid h-5 w-5 place-items-center rounded"
            style={{ backgroundColor: a.bg, color: a.fg }}
          >
            <Icon className="h-3 w-3" aria-hidden />
          </span>
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">
          {value.toLocaleString()}
        </div>
        <div className={`mt-1 inline-flex items-center gap-1 font-mono text-[11px] ${toneClass}`}>
          {subTone === 'success' ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : null}
          {subTone === 'danger' ? <ArrowDownRight className="h-3 w-3" aria-hidden /> : null}
          {subValue}
        </div>
      </CardContent>
    </Card>
  );
}

function CapturesChart({ data }: { data: Array<{ day: string; count: number }> }) {
  const days = useMemo(() => {
    const map = new Map<string, number>();
    let latestTimestamp = Number.NEGATIVE_INFINITY;
    data.forEach((point) => {
      const parsed = parseChartDate(point.day);
      if (!parsed) return;
      latestTimestamp = Math.max(latestTimestamp, parsed.getTime());
      const key = chartDateKey(parsed);
      map.set(key, point.count);
    });
    const out: Array<{ day: Date; count: number }> = [];
    const end = Number.isFinite(latestTimestamp) ? new Date(latestTimestamp) : startOfLocalDay(new Date());
    for (let i = 29; i >= 0; i--) {
      const date = new Date(end.getTime() - i * 24 * 60 * 60 * 1_000);
      const key = chartDateKey(date);
      out.push({ day: date, count: map.get(key) ?? 0 });
    }
    return out;
  }, [data]);
  const max = useMemo(() => Math.max(1, ...days.map((d) => d.count)), [days]);
  const total = useMemo(() => days.reduce((sum, point) => sum + point.count, 0), [days]);
  const hasData = total > 0;

  const chartData = useMemo(
    () =>
      days.map((point) => ({
        label: point.day.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        count: point.count,
      })),
    [days],
  );

  return (
    <Card className="overflow-hidden bg-[var(--bg)]">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-sm">Captures · last 30 days</CardTitle>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--ink-faint)]">
            cross-tenant aggregate
          </p>
        </div>
        <div className="text-right font-mono text-[11px] text-[var(--ink-faint)]">
          <div>peak {max}</div>
          <div>{total} total</div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={capturesChartConfig} className="aspect-auto h-64 w-full">
            <BarChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }} barCategoryGap="35%">
              <CartesianGrid vertical={false} stroke="var(--divider)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                tick={{ fill: 'var(--ink-faint)', fontSize: 10 }}
              />
              <ChartTooltip cursor={{ fill: 'var(--surface-deep)' }} content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={18} minPointSize={2} />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-6 text-center">
            <div>
              <div className="text-sm font-semibold text-[var(--ink)]">No captures yet</div>
              <div className="mt-1 text-xs text-[var(--ink-muted)]">
                Cross-tenant activity will appear here once recordings are created.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function parseChartDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function chartDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="overflow-hidden bg-[var(--bg)]">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm">Recent captures</CardTitle>
        <span className="font-mono text-[11px] text-[var(--ink-faint)]">{items.length}</span>
      </CardHeader>
      <ScrollArea className="max-h-[24rem]">
        {items.length === 0 ? (
          <div className="p-6 text-center font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
            no recent activity
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="border-b border-[var(--divider)] px-5 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-[var(--ink)]">{item.title}</span>
                <time className="shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
                  {relative(item.createdAt)}
                </time>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-[var(--ink-muted)]">
                <span className="text-[var(--primary)]">{item.workspace.slug}</span> · {item.createdBy?.email ?? '—'}
              </div>
            </div>
          ))
        )}
      </ScrollArea>
    </Card>
  );
}

function TenantsTab() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialog = useDialog();

  async function refresh() {
    setIsLoading(true);
    setError(null);
    try {
      setWorkspaces(await apiClient.platformWorkspaces());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenants.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggleStatus(workspace: Workspace) {
    const next = workspace.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (next === 'SUSPENDED') {
      const ok = await dialog.confirm({
        title: `Suspend ${workspace.name}?`,
        description: 'All members will immediately lose access. You can reactivate the workspace anytime.',
        confirmLabel: 'Suspend workspace',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await apiClient.platformSetWorkspaceStatus(workspace.id, next);
    await refresh();
  }

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  return (
    <Card className="overflow-hidden bg-[var(--bg)]">
      <div className="hidden grid-cols-[2fr_repeat(4,minmax(0,1fr))_auto] gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] md:grid">
        <span>Workspace</span>
        <span>Status</span>
        <span className="text-right">Members</span>
        <span className="text-right">Projects</span>
        <span className="text-right">Captures</span>
        <span>Actions</span>
      </div>
      <div className="divide-y divide-[var(--divider)]">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className="flex flex-col gap-3 px-4 py-3 md:grid md:grid-cols-[2fr_repeat(4,minmax(0,1fr))_auto] md:items-center md:gap-4 md:px-5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--ink)]">{ws.name}</div>
              <div className="truncate font-mono text-[11px] text-[var(--ink-faint)]">
                {ws.slug} · created {new Date(ws.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 md:contents">
              <StatusPill status={ws.status} />
              <div className="flex items-center gap-3 md:contents">
                <span className="font-mono text-xs text-[var(--ink-faint)] md:hidden">members</span>
                <span className="text-right font-mono text-sm tabular-nums text-[var(--ink)]">{ws.memberCount}</span>
                <span className="font-mono text-xs text-[var(--ink-faint)] md:hidden">projects</span>
                <span className="text-right font-mono text-sm tabular-nums text-[var(--ink)]">{ws.projectCount}</span>
                <span className="font-mono text-xs text-[var(--ink-faint)] md:hidden">captures</span>
                <span className="text-right font-mono text-sm tabular-nums text-[var(--ink)]">{ws.reportCount}</span>
              </div>
            </div>
            <Button
              type="button"
              variant={ws.status === 'ACTIVE' ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => void toggleStatus(ws)}
            >
              {ws.status === 'ACTIVE' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {ws.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialog = useDialog();

  async function refresh(query?: string) {
    setIsLoading(true);
    setError(null);
    try {
      setUsers(await apiClient.platformUsers(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => void refresh(search), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  async function toggleStatus(user: PlatformUser) {
    const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (next === 'SUSPENDED') {
      const ok = await dialog.confirm({
        title: `Suspend ${user.displayName ?? user.email}?`,
        description: 'They will be logged out immediately and blocked from signing back in until reactivated.',
        confirmLabel: 'Suspend user',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await apiClient.platformSetUserStatus(user.id, next);
    await refresh(search);
  }

  async function togglePlatformRole(user: PlatformUser) {
    const next = user.platformRole === 'PLATFORM_ADMIN' ? 'USER' : 'PLATFORM_ADMIN';
    const isPromoting = next === 'PLATFORM_ADMIN';
    const ok = await dialog.confirm({
      title: isPromoting ? 'Promote to platform admin?' : 'Demote from platform admin?',
      description: isPromoting ? (
        <>
          <strong className="text-[var(--ink)]">{user.email}</strong> will gain full cross-tenant access — view
          and manage every workspace and user on this Weevil instance.
        </>
      ) : (
        <>
          <strong className="text-[var(--ink)]">{user.email}</strong> will lose platform-admin access. They keep
          their existing workspace memberships.
        </>
      ),
      confirmLabel: isPromoting ? 'Promote' : 'Demote',
      tone: isPromoting ? 'warning' : 'default',
    });
    if (!ok) return;
    try {
      await apiClient.platformSetUserRole(user.id, next);
      await refresh(search);
    } catch (err) {
      await dialog.alert({
        title: 'Could not update role',
        description: err instanceof Error ? err.message : 'Unknown error.',
        tone: 'danger',
      });
    }
  }

  if (error) return <ErrorBlock message={error} />;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="pl-9"
        />
      </div>
      <Card className="overflow-hidden bg-[var(--bg)]">
        <div className="hidden grid-cols-[2fr_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] lg:grid">
          <span>User</span>
          <span>Status</span>
          <span>Platform role</span>
          <span>Workspaces</span>
          <span>Actions</span>
        </div>
        {isLoading ? (
          <LoadingBlock />
        ) : (
          <div className="divide-y divide-[var(--divider)]">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col gap-3 px-4 py-3 lg:grid lg:grid-cols-[2fr_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-center lg:gap-4 lg:px-5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--ink)]">
                    {user.displayName ?? user.email}
                  </div>
                  <div className="truncate font-mono text-[11px] text-[var(--ink-faint)]">
                    {user.email}
                  </div>
                </div>
                <StatusPill status={user.status} />
                <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                  {user.platformRole === 'PLATFORM_ADMIN' ? (
                    <span className="inline-flex items-center gap-1 text-[var(--primary)]">
                      <ShieldCheck className="h-3 w-3" />
                      platform admin
                    </span>
                  ) : (
                    user.platformRole.toLowerCase()
                  )}
                </span>
                <div className="min-w-0">
                  {user.workspaces.length === 0 ? (
                    <span className="font-mono text-[11px] text-[var(--ink-faint)]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {user.workspaces.map((ws) => (
                        <span
                          key={ws.id}
                          className="inline-flex items-center gap-1 rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px]"
                        >
                          <span className="text-[var(--primary)]">{ws.slug}</span>
                          <span className="text-[var(--ink-faint)]">·</span>
                          <span className="text-[var(--ink-muted)]">{ws.role.toLowerCase()}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => void togglePlatformRole(user)}>
                    {user.platformRole === 'PLATFORM_ADMIN' ? 'Demote' : 'Promote'}
                  </Button>
                  <Button
                    type="button"
                    variant={user.status === 'ACTIVE' ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => void toggleStatus(user)}
                  >
                    {user.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-[var(--success-bg)] text-[var(--success)]'
      : status === 'SUSPENDED'
        ? 'bg-[var(--danger-bg)] text-[var(--danger)]'
        : 'bg-[var(--surface)] text-[var(--ink-faint)]';
  return (
    <span
      className={`inline-flex h-6 items-center rounded px-2 font-mono text-[10px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function LoadingBlock() {
  return (
    <div className="grid place-items-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-faint)]" aria-hidden />
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <Card className="border-[var(--danger-border)] bg-[var(--danger-bg)] text-sm text-[var(--danger)]">
      <CardContent className="p-4">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Error
      </div>
      <p className="mt-1 font-mono text-[11px]">{message}</p>
      </CardContent>
    </Card>
  );
}

function relative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
