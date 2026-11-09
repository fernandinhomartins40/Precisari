import type { UserRole } from '@precisari/shared';

/** Access token claims and the request user attached by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: UserRole;
}
