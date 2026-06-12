import { redirect } from 'next/navigation';

const VIEW_REDIRECTS: Record<string, string> = {
  captures: '/captures',
  inbox: '/captures',
  'project-board': '/board',
  board: '/board',
  settings: '/settings',
  platform: '/platform',
};

/**
 * Root entry. The dashboard lives under the (dashboard) route group; captures is
 * home. Also preserves legacy `?capture=` / `?view=` links (from before the App
 * Router migration) by redirecting them to their new routes.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const capture = typeof params.capture === 'string' ? params.capture : undefined;
  if (capture) {
    redirect(`/c/${capture}`);
  }
  const view = typeof params.view === 'string' ? params.view : undefined;
  redirect((view && VIEW_REDIRECTS[view]) || '/captures');
}
