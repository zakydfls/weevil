import type { Metadata } from 'next';
import { CaptureDetailRoute } from '@/features/reports/components/capture-detail-route';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}): Promise<Metadata> {
  await params;
  const title = 'Shared capture · Weevil';
  const description =
    'A shared Weevil capture with recording, console, network, actions, and errors.';
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function SharedCapturePage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  return <CaptureDetailRoute shareToken={shareToken} />;
}
