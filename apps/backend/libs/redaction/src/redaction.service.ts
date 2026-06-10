import { Injectable } from '@nestjs/common';
import { RedactionDefaults } from '@weevil/contracts';

const SENSITIVE_KEYWORDS = [
  'authorization',
  'cookie',
  'password',
  'passwd',
  'secret',
  'token',
  'api-key',
  'apikey',
  'session',
] as const;

const RedactionPreferenceKeys = {
  RedactSensitiveData: 'redactSensitiveData',
} as const;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

@Injectable()
export class RedactionService {
  shouldRedact(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return true;
    }

    return (metadata as Record<string, unknown>)[RedactionPreferenceKeys.RedactSensitiveData] !== false;
  }

  redactRecord(input: Record<string, unknown> | undefined): Record<string, JsonValue> | undefined {
    if (!input) {
      return undefined;
    }

    return this.redactObject(input);
  }

  redactText(input: string | undefined): string | undefined {
    if (!input) {
      return undefined;
    }

    return input.replace(
      /(authorization|token|password|secret|api[-_]?key)=(?!\[REDACTED\])([^&\s\])"'}]+)/gi,
      `$1=${RedactionDefaults.RedactedValue}`,
    );
  }

  private redactObject(input: Record<string, unknown>): Record<string, JsonValue> {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        this.isSensitiveKey(key) ? RedactionDefaults.RedactedValue : this.redactValue(value),
      ]),
    );
  }

  private redactValue(value: unknown): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactValue(item));
    }

    if (typeof value === 'object') {
      return this.redactObject(value as Record<string, unknown>);
    }

    return null;
  }

  private isSensitiveKey(key: string): boolean {
    const normalizedKey = key.toLowerCase();
    return SENSITIVE_KEYWORDS.some((keyword) => normalizedKey.includes(keyword));
  }
}
