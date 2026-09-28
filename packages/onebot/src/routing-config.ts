import type {
  GroupMessageFilterConfig,
  JsonObject,
  KeywordFilterConfig,
  MessagePrefixConfig,
  PrivateMessageFilterConfig,
  WsClientNetwork,
} from './types';

export const ROUTING_WS_CLIENT_KEYS = [
  'groupMessageFilter',
  'privateMessageFilter',
  'keywordFilter',
  'messagePrefix',
] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    const number = typeof item === 'string' && item.trim() ? Number(item) : item;
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0 || seen.has(number)) continue;
    seen.add(number);
    out.push(number);
  }
  return out;
}

function normalizePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const pattern = item.trim();
    if (!pattern || seen.has(pattern)) continue;
    seen.add(pattern);
    out.push(pattern);
  }
  return out;
}

function parseMode(value: unknown): 'blacklist' | 'whitelist' | null {
  return value === 'blacklist' || value === 'whitelist' ? value : null;
}

export function parseGroupMessageFilter(value: unknown): GroupMessageFilterConfig | undefined {
  if (!isObject(value)) return undefined;
  const mode = parseMode(value.mode);
  if (!mode) return undefined;
  return { mode, groupIds: normalizeIds(value.groupIds) };
}

export function parsePrivateMessageFilter(value: unknown): PrivateMessageFilterConfig | undefined {
  if (!isObject(value)) return undefined;
  const mode = parseMode(value.mode);
  if (!mode) return undefined;
  return { mode, userIds: normalizeIds(value.userIds) };
}

export function parseKeywordFilter(value: unknown): KeywordFilterConfig | undefined {
  if (!isObject(value)) return undefined;
  const mode = parseMode(value.mode);
  if (!mode) return undefined;
  const groupIds = value.groupIds === undefined ? undefined : normalizeIds(value.groupIds);
  return {
    mode,
    patterns: normalizePatterns(value.patterns),
    ...(typeof value.regex === 'boolean' ? { regex: value.regex } : {}),
    ...(groupIds && groupIds.length > 0 ? { groupIds } : {}),
  };
}

export function parseMessagePrefix(value: unknown): MessagePrefixConfig | undefined {
  if (!isObject(value) || typeof value.prefix !== 'string') return undefined;
  const prefix = value.prefix.trim();
  if (!prefix || /[\r\n]/.test(prefix)) return undefined;
  const groupIds = normalizeIds(value.groupIds);
  if (groupIds.length === 0) return undefined;
  return { prefix, groupIds };
}

function validatePositiveIdArray(value: unknown, at: string, requireNonEmpty: boolean): string | null {
  if (!Array.isArray(value)) return `${at} must be an array`;
  if (requireNonEmpty && value.length === 0) return `${at} must contain at least one group ID`;
  for (const [index, raw] of value.entries()) {
    const number = typeof raw === 'string' && raw.trim() ? Number(raw) : raw;
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0) {
      return `${at}[${String(index)}] must be a positive safe integer`;
    }
  }
  return null;
}

function validateMode(value: unknown, at: string): string | null {
  return value === 'blacklist' || value === 'whitelist'
    ? null
    : `${at}.mode must be blacklist or whitelist`;
}

export function validateWsClientRouting(value: JsonObject, at: string): string | null {
  if (value.groupMessageFilter !== undefined) {
    const raw = value.groupMessageFilter;
    if (!isObject(raw)) return `${at}.groupMessageFilter must be an object`;
    const unknown = Object.keys(raw).find((key) => key !== 'mode' && key !== 'groupIds');
    if (unknown) return `${at}.groupMessageFilter.${unknown} is not supported`;
    const modeError = validateMode(raw.mode, `${at}.groupMessageFilter`);
    if (modeError) return modeError;
    const idsError = validatePositiveIdArray(raw.groupIds, `${at}.groupMessageFilter.groupIds`, false);
    if (idsError) return idsError;
  }

  if (value.privateMessageFilter !== undefined) {
    const raw = value.privateMessageFilter;
    if (!isObject(raw)) return `${at}.privateMessageFilter must be an object`;
    const unknown = Object.keys(raw).find((key) => key !== 'mode' && key !== 'userIds');
    if (unknown) return `${at}.privateMessageFilter.${unknown} is not supported`;
    const modeError = validateMode(raw.mode, `${at}.privateMessageFilter`);
    if (modeError) return modeError;
    const idsError = validatePositiveIdArray(raw.userIds, `${at}.privateMessageFilter.userIds`, false);
    if (idsError) return idsError;
  }

  if (value.keywordFilter !== undefined) {
    const raw = value.keywordFilter;
    if (!isObject(raw)) return `${at}.keywordFilter must be an object`;
    const unknown = Object.keys(raw).find((key) => !['mode', 'patterns', 'regex', 'groupIds'].includes(key));
    if (unknown) return `${at}.keywordFilter.${unknown} is not supported`;
    const modeError = validateMode(raw.mode, `${at}.keywordFilter`);
    if (modeError) return modeError;
    if (!Array.isArray(raw.patterns) || raw.patterns.some((pattern) => typeof pattern !== 'string' || !pattern.trim())) {
      return `${at}.keywordFilter.patterns must contain non-empty strings`;
    }
    if (raw.regex !== undefined && typeof raw.regex !== 'boolean') return `${at}.keywordFilter.regex must be a boolean`;
    if (raw.groupIds !== undefined) {
      const idsError = validatePositiveIdArray(raw.groupIds, `${at}.keywordFilter.groupIds`, false);
      if (idsError) return idsError;
    }
    if (raw.regex === true) {
      for (const pattern of raw.patterns as string[]) {
        try {
          new RegExp(pattern);
        } catch {
          return `${at}.keywordFilter.patterns contains an invalid regular expression`;
        }
      }
    }
  }

  if (value.messagePrefix !== undefined) {
    const raw = value.messagePrefix;
    if (!isObject(raw)) return `${at}.messagePrefix must be an object`;
    const unknown = Object.keys(raw).find((key) => key !== 'prefix' && key !== 'groupIds');
    if (unknown) return `${at}.messagePrefix.${unknown} is not supported`;
    if (typeof raw.prefix !== 'string' || !raw.prefix.trim() || /[\r\n]/.test(raw.prefix)) {
      return `${at}.messagePrefix.prefix must be a non-empty single-line string`;
    }
    const idsError = validatePositiveIdArray(raw.groupIds, `${at}.messagePrefix.groupIds`, true);
    if (idsError) return idsError;
  }

  return null;
}

export function routingConfigToJson(n: WsClientNetwork): JsonObject {
  const out: JsonObject = {};
  if (n.groupMessageFilter) {
    out.groupMessageFilter = {
      mode: n.groupMessageFilter.mode,
      groupIds: [...new Set(n.groupMessageFilter.groupIds)],
    };
  }
  if (n.privateMessageFilter) {
    out.privateMessageFilter = {
      mode: n.privateMessageFilter.mode,
      userIds: [...new Set(n.privateMessageFilter.userIds)],
    };
  }
  if (n.keywordFilter) {
    const keyword: JsonObject = {
      mode: n.keywordFilter.mode,
      patterns: [...new Set(n.keywordFilter.patterns)],
    };
    if (typeof n.keywordFilter.regex === 'boolean') keyword.regex = n.keywordFilter.regex;
    if (n.keywordFilter.groupIds && n.keywordFilter.groupIds.length > 0) {
      keyword.groupIds = [...new Set(n.keywordFilter.groupIds)];
    }
    out.keywordFilter = keyword;
  }
  if (n.messagePrefix) {
    out.messagePrefix = {
      prefix: n.messagePrefix.prefix.trim(),
      groupIds: [...new Set(n.messagePrefix.groupIds)],
    };
  }
  return out;
}
