'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import type { CreateReportInput, ReportSummary } from '@/lib/api/types';
import { useCreateReport } from '../queries';

interface ReportCreateFormProps {
  onCreated: (report: ReportSummary) => void;
}

export function ReportCreateForm({ onCreated }: ReportCreateFormProps) {
  const [title, setTitle] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [description, setDescription] = useState('');
  const createReport = useCreateReport();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: CreateReportInput = {
      title: title.trim() || `Bug report ${new Date().toLocaleTimeString()}`,
      description: description.trim() || undefined,
      source: 'DASHBOARD',
      pageUrl: pageUrl.trim() || undefined,
      browserName: detectBrowserName(),
      browserVersion: detectBrowserVersion(),
      osName: navigator.platform,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      metadata: {
        createdFrom: 'weevil-web',
      },
    };

    const report = await createReport.mutateAsync(input);
    setTitle('');
    setDescription('');
    onCreated(report);
  }

  return (
    <Card asChild className="rounded-md bg-[var(--bg)] p-4">
    <form onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">New report</h1>
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            Create a report from the dashboard
          </p>
        </div>
        <Button type="submit" size="sm" disabled={createReport.isPending}>
          {createReport.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Create
        </Button>
      </div>
      <div className="mt-3 grid gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          aria-label="Title"
        />
        <Input
          value={pageUrl}
          onChange={(event) => setPageUrl(event.target.value)}
          placeholder="Page URL"
          aria-label="Page URL"
        />
        <Textarea
          className="min-h-14"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description"
          aria-label="Description"
        />
      </div>
      {createReport.error ? (
        <p className="mt-3 text-sm text-[var(--danger)]">{getErrorMessage(createReport.error)}</p>
      ) : null}
    </form>
    </Card>
  );
}

function detectBrowserName() {
  const userAgent = navigator.userAgent;

  if (userAgent.includes('Chrome')) {
    return 'Chrome';
  }

  if (userAgent.includes('Safari')) {
    return 'Safari';
  }

  if (userAgent.includes('Firefox')) {
    return 'Firefox';
  }

  return 'Browser';
}

function detectBrowserVersion() {
  const match = navigator.userAgent.match(/(Chrome|Firefox|Version)\/([\d.]+)/);
  return match?.[2] ?? undefined;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to create report';
}
