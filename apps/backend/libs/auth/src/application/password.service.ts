import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/**
 * Password hashing. Defaults align with OWASP 2024 minimums for argon2id:
 * memory ≥ 19 MiB, iterations ≥ 2, parallelism = 1.
 */
@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return hash(plain, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }
}
