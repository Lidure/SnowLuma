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
  regex?: boolean;
  /** Empty/undefined means all group chats, preserving legacy behavior. */
  groupIds?: number[];
}

export interface MessagePrefixConfig {
  prefix: string;
  groupIds: number[];
}

export interface SelectOptionLike {
  value: string;
  label: string;
  sub?: string;
  avatar?: string;
}

export interface ResolvedSelectedOption extends SelectOptionLike {
  missing?: boolean;
}

function parseIdListInput(value: string, noun: string): { ids: number[]; error?: string } {
  const text = value.trim();
  if (!text) return { ids: [] };
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return { ids: [], error: `${noun}“${token}”格式不正确` };
    const id = Number(token);
    if (!Number.isSafeInteger(id) || id <= 0) return { ids: [], error: `${noun}“${token}”不是有效正整数` };
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return { ids };
}

export function parseGroupIdsInput(value: string): { groupIds: number[]; error?: string } {
  const { ids, error } = parseIdListInput(value, '群号');
  return { groupIds: ids, error };
}

export function formatGroupIdsInput(groupIds: number[] | undefined): string {
  return (groupIds ?? []).join(', ');
}

export function parseUserIdsInput(value: string): { userIds: number[]; error?: string } {
  const { ids, error } = parseIdListInput(value, 'QQ号');
  return { userIds: ids, error };
}

export function formatUserIdsInput(userIds: number[] | undefined): string {
  return (userIds ?? []).join(', ');
}

export function parseKeywordPatternsInput(value: string, regex: boolean): { patterns: string[]; error?: string } {
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
      try { new RegExp(pattern); } catch { return { patterns: [], error: `正则“${pattern}”无法编译` }; }
    }
  }
  return { patterns };
}

export function formatKeywordPatternsInput(patterns: string[] | undefined): string {
  return (patterns ?? []).join('\n');
}

export function mergeSelectedValues(current: string[], incoming: string[]): string[] {
  const seen = new Set(current);
  const merged = [...current];
  for (const value of incoming) {
    if (!seen.has(value)) {
      seen.add(value);
      merged.push(value);
    }
  }
  return merged;
}

export function resolveSelectedOptions(
  values: string[],
  options: ReadonlyArray<SelectOptionLike>,
  fallbackLabel: string,
): ResolvedSelectedOption[] {
  const byValue = new Map(options.map((option) => [option.value, option]));
  return values.map((value) => {
    const option = byValue.get(value);
    return option ?? { value, label: fallbackLabel, sub: value, missing: true };
  });
}
