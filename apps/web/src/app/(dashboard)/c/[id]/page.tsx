import type { Metadata } from 'next';
import { CaptureDetailRoute } from '@/features/reports/components/capture-detail-route';

// Static-but-rich metadata for the shareable capture URL. Per-capture title /
// thumbnail unfurls require a public (auth-free) metadata endpoint on the API —
// tracked separately; until then this gives a clean, on-brand share card.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await params;
  const title = 'Capture · Weevil';
  const description =
    'A debuggable Weevil capture — video, console, network, actions, and errors on one timeline.';
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaptureDetailRoute id={id} />;
}
