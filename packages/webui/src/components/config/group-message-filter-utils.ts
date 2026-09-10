export type GroupMessageFilterMode = 'blacklist' | 'whitelist';

export interface GroupMessageFilterConfig {
  mode: GroupMessageFilterMode;
  groupIds: number[];
}

export interface PrivateMessageFilterConfig {
  mode: GroupMessageFilterMode;
  userIds: number[];
}

export interface KeywordFilterConfig {
  mode: GroupMessageFilterMode;
  patterns: string[];
  /** When true, patterns are regular expressions; otherwise plain substrings. */
  regex?: boolean;
}

export interface GroupIdParseResult {
  groupIds: number[];
  error?: string;
}

function parseIdListInput(value: string, noun: string): { ids: number[]; error?: string } {
  const text = value.trim();
  if (!text) return { ids: [] };

  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const seen = new Set<number>();
  const ids: number[] = [];

  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      return { ids: [], error: `${noun}“${token}”格式不正确` };
    }
    const id = Number(token);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return { ids: [], error: `${noun}“${token}”不是有效正整数` };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return { ids };
}

export function parseGroupIdsInput(value: string): GroupIdParseResult {
  const { ids, error } = parseIdListInput(value, '群号');
  return { groupIds: ids, error };
}

export function formatGroupIdsInput(groupIds: number[]): string {
  return groupIds.join(', ');
}

export interface UserIdParseResult {
  userIds: number[];
  error?: string;
}

export function parseUserIdsInput(value: string): UserIdParseResult {
  const { ids, error } = parseIdListInput(value, 'QQ号');
  return { userIds: ids, error };
}

export function formatUserIdsInput(userIds: number[]): string {
  return userIds.join(', ');
}

export interface KeywordParseResult {
  patterns: string[];
  error?: string;
}

/**
 * One pattern per line. Blank lines are dropped; duplicates are removed
 * keeping first occurrence. When `regex` is on, each pattern must compile.
 */
export function parseKeywordPatternsInput(value: string, regex: boolean): KeywordParseResult {
  const seen = new Set<string>();
  const patterns: string[] = [];

  for (const line of value.split('\n')) {
    const pattern = line.trim();
    if (!pattern || seen.has(pattern)) continue;
    seen.add(pattern);
    patterns.push(pattern);
  }

  if (regex) {
    for (const pattern of patterns) {
      try {
        new RegExp(pattern);
      } catch {
        return { patterns: [], error: `正则“${pattern}”无法编译` };
      }
    }
  }

  return { patterns };
}

export function formatKeywordPatternsInput(patterns: string[]): string {
  return patterns.join('\n');
}
