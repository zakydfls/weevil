import { redirect } from 'next/navigation';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = first(params.token) ?? first(params.inviteToken) ?? first(params.invite);
  redirect(token ? `/signup?inviteToken=${encodeURIComponent(token)}` : '/signup');
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
