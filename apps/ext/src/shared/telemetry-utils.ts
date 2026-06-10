import { DEFAULT_MAX_BODY_CHARS, DEFAULT_MAX_TEXT_CHARS } from './constants';

export function nowIso() {
  return new Date().toISOString();
}

export function offsetFrom(startedAt: string | null | undefined, occurredAt?: string | null | undefined) {
  if (!startedAt) {
    return undefined;
  }

  const endTime = occurredAt ? new Date(occurredAt).getTime() : Date.now();
  return Math.max(0, endTime - new Date(startedAt).getTime());
}

export function truncateText(value: string | null | undefined, maxLength = DEFAULT_MAX_TEXT_CHARS) {
  if (!value) {
    return undefined;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function truncateBody(value: string | null | undefined) {
  return truncateText(value, DEFAULT_MAX_BODY_CHARS);
}

export function safeStringify(value: unknown, maxLength = DEFAULT_MAX_TEXT_CHARS) {
  if (typeof value === 'string') {
    return truncateText(value, maxLength) ?? '';
  }

  try {
    return truncateText(JSON.stringify(value), maxLength) ?? '';
  } catch {
    return String(value);
  }
}

export function toJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function getCssSelector(element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
    const tagName = current.tagName.toLowerCase();
    const id = current.id ? `#${cssEscape(current.id)}` : '';
    const className = Array.from(current.classList)
      .slice(0, 3)
      .map((item) => `.${cssEscape(item)}`)
      .join('');

    if (id) {
      parts.unshift(`${tagName}${id}`);
      break;
    }

    parts.unshift(`${tagName}${className}`);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

export function getNodePath(element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.parentElement && parts.length < 8) {
    const siblings = Array.from(current.parentElement.children).filter(
      (item) => item.tagName === current?.tagName,
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

export function getElementLabel(element: Element) {
  const ariaLabel = element.getAttribute('aria-label');
  const title = element.getAttribute('title');
  const text = element.textContent?.trim();
  return truncateText(ariaLabel || title || text || undefined, 500);
}

export function getElementValue(element: Element) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return truncateText(element.value);
  }

  if (element instanceof HTMLSelectElement) {
    return truncateText(element.value);
  }

  return undefined;
}

export function cssEscape(value: string) {
  if ('CSS' in globalThis && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
