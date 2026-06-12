import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'weevil:public';

/**
 * Marks a route as public — skipped by AuthGuard.
 * Use for /auth/signup, /auth/login, /reports/share/:token, health checks.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
