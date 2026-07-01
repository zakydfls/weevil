import { AcceptInviteClient } from './accept-invite-client';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = first(params.token) ?? first(params.inviteToken) ?? first(params.invite) ?? '';
  return <AcceptInviteClient inviteToken={token} />;
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
