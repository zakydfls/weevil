import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque bearer tokens (sessions + API tokens).
 *
 * Design choice: opaque random tokens, not JWTs. Reasons:
 * - Revocation is instant (just delete the row); JWTs require denylists.
 * - No claim leakage if the token surface is logged.
 * - Allows secret rotation per-session without rotating signing keys.
 *
 * Storage: only the SHA-256 hash lives in the DB. The raw token is returned
 * to the client exactly once at issuance.
 */
@Injectable()
export class TokenService {
  /** Generate a fresh opaque token. Format: `wv_<48-char base64url>`. */
  generate(prefix: 'sess' | 'tok' = 'sess'): { raw: string; hash: string } {
    const bytes = randomBytes(36);
    const random = bytes.toString('base64url');
    const raw = `wv_${prefix}_${random}`;
    return { raw, hash: this.hash(raw) };
  }

  /** SHA-256 hash of a token, hex-encoded. Suitable for unique DB lookups. */
  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
