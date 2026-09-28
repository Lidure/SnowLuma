from pathlib import Path

path = Path('packages/onebot/src/config.ts')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match, found {count}: {old[:80]!r}')
    text = text.replace(old, new, 1)


replace_once(
"""  KeywordFilterConfig,\n  MessageFormat,""",
"""  KeywordFilterConfig,\n  MessageFormat,\n  MessagePrefixConfig,""",
)

replace_once(
"""const KEYWORD_FILTER_KEYS = new Set(['mode', 'patterns', 'regex']);\n/** Caps for keyword filter patterns — generous enough for real rules while\n *  keeping pathological configs out of the hot dispatch path. */\nexport const KEYWORD_FILTER_MAX_PATTERNS = 200;\nexport const KEYWORD_FILTER_PATTERN_MAX_LENGTH = 256;""",
"""const KEYWORD_FILTER_KEYS = new Set(['mode', 'patterns', 'regex', 'groupIds']);\nconst MESSAGE_PREFIX_KEYS = new Set(['prefix', 'groupIds']);\n/** Caps for keyword filter patterns — generous enough for real rules while\n *  keeping pathological configs out of the hot dispatch path. */\nexport const KEYWORD_FILTER_MAX_PATTERNS = 200;\nexport const KEYWORD_FILTER_PATTERN_MAX_LENGTH = 256;\nexport const MESSAGE_PREFIX_MAX_LENGTH = 64;""",
)

replace_once(
"""      : ['url', 'role', 'reconnectIntervalMs', 'groupMessageFilter', 'privateMessageFilter', 'keywordFilter'];""",
"""      : ['url', 'role', 'reconnectIntervalMs', 'groupMessageFilter', 'privateMessageFilter', 'keywordFilter', 'messagePrefix'];""",
)

replace_once(
"""      validateGroupMessageFilter(raw.groupMessageFilter, `${pathAt}.groupMessageFilter`);\n      validatePrivateMessageFilter(raw.privateMessageFilter, `${pathAt}.privateMessageFilter`);\n      validateKeywordFilter(raw.keywordFilter, `${pathAt}.keywordFilter`);""",
"""      validateGroupMessageFilter(raw.groupMessageFilter, `${pathAt}.groupMessageFilter`);\n      validatePrivateMessageFilter(raw.privateMessageFilter, `${pathAt}.privateMessageFilter`);\n      validateKeywordFilter(raw.keywordFilter, `${pathAt}.keywordFilter`);\n      validateMessagePrefix(raw.messagePrefix, `${pathAt}.messagePrefix`);""",
)

replace_once(
"""    validateGroupMessageFilter(item.groupMessageFilter, `${at}.groupMessageFilter`);\n    validatePrivateMessageFilter(item.privateMessageFilter, `${at}.privateMessageFilter`);\n    validateKeywordFilter(item.keywordFilter, `${at}.keywordFilter`);""",
"""    validateGroupMessageFilter(item.groupMessageFilter, `${at}.groupMessageFilter`);\n    validatePrivateMessageFilter(item.privateMessageFilter, `${at}.privateMessageFilter`);\n    validateKeywordFilter(item.keywordFilter, `${at}.keywordFilter`);\n    validateMessagePrefix(item.messagePrefix, `${at}.messagePrefix`);""",
)

old_keyword = """function validateKeywordFilter(value: unknown, at: string): void {\n  if (value === undefined) return;\n  if (!isObject(value)) invalid(`${at} must be an object`);\n  rejectUnknownKeys(value, KEYWORD_FILTER_KEYS, at);\n  if (value.mode !== 'blacklist' && value.mode !== 'whitelist') {\n    invalid(`${at}.mode must be blacklist or whitelist`);\n  }\n  if (!Array.isArray(value.patterns)) invalid(`${at}.patterns must be an array`);\n  if (value.patterns.length > KEYWORD_FILTER_MAX_PATTERNS) {\n    invalid(`${at}.patterns must contain at most ${KEYWORD_FILTER_MAX_PATTERNS} entries`);\n  }\n  if (value.regex !== undefined && typeof value.regex !== 'boolean') {\n    invalid(`${at}.regex must be a boolean`);\n  }\n  value.patterns.forEach((pattern, index) => {\n    if (typeof pattern !== 'string' || pattern.length === 0) {\n      invalid(`${at}.patterns[${String(index)}] must be a non-empty string`);\n    }\n    if (pattern.length > KEYWORD_FILTER_PATTERN_MAX_LENGTH) {\n      invalid(`${at}.patterns[${String(index)}] must be at most ${KEYWORD_FILTER_PATTERN_MAX_LENGTH} characters`);\n    }\n    if (value.regex === true) {\n      try {\n        new RegExp(pattern);\n      } catch {\n        invalid(`${at}.patterns[${String(index)}] is not a valid regular expression`);\n      }\n    }\n  });\n}\n\nfunction parseKeywordFilter(value: unknown): KeywordFilterConfig | undefined {\n  if (value === undefined) return undefined;\n  validateKeywordFilter(value, 'ws client keywordFilter');\n  const raw = value as JsonObject;\n  const seen = new Set<string>();\n  const patterns: string[] = [];\n  for (const pattern of raw.patterns as string[]) {\n    if (seen.has(pattern)) continue;\n    seen.add(pattern);\n    patterns.push(pattern);\n  }\n  return clean({\n    mode: raw.mode as KeywordFilterConfig['mode'],\n    patterns,\n    regex: raw.regex === true ? true : undefined,\n  }) as KeywordFilterConfig;\n}\n"""

new_keyword = """function validatePositiveIdArray(value: unknown, at: string, allowEmpty: boolean): void {\n  if (!Array.isArray(value)) invalid(`${at} must be an array`);\n  if (!allowEmpty && value.length === 0) invalid(`${at} must contain at least one entry`);\n  value.forEach((id, index) => {\n    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {\n      invalid(`${at}[${String(index)}] must be a positive safe integer`);\n    }\n  });\n}\n\nfunction dedupePositiveIds(value: number[]): number[] {\n  return [...new Set(value)];\n}\n\nfunction validateKeywordFilter(value: unknown, at: string): void {\n  if (value === undefined) return;\n  if (!isObject(value)) invalid(`${at} must be an object`);\n  rejectUnknownKeys(value, KEYWORD_FILTER_KEYS, at);\n  if (value.mode !== 'blacklist' && value.mode !== 'whitelist') {\n    invalid(`${at}.mode must be blacklist or whitelist`);\n  }\n  if (!Array.isArray(value.patterns)) invalid(`${at}.patterns must be an array`);\n  if (value.patterns.length > KEYWORD_FILTER_MAX_PATTERNS) {\n    invalid(`${at}.patterns must contain at most ${KEYWORD_FILTER_MAX_PATTERNS} entries`);\n  }\n  if (value.regex !== undefined && typeof value.regex !== 'boolean') {\n    invalid(`${at}.regex must be a boolean`);\n  }\n  if (value.groupIds !== undefined) validatePositiveIdArray(value.groupIds, `${at}.groupIds`, true);\n  value.patterns.forEach((pattern, index) => {\n    if (typeof pattern !== 'string' || pattern.length === 0) {\n      invalid(`${at}.patterns[${String(index)}] must be a non-empty string`);\n    }\n    if (pattern.length > KEYWORD_FILTER_PATTERN_MAX_LENGTH) {\n      invalid(`${at}.patterns[${String(index)}] must be at most ${KEYWORD_FILTER_PATTERN_MAX_LENGTH} characters`);\n    }\n    if (value.regex === true) {\n      try {\n        new RegExp(pattern);\n      } catch {\n        invalid(`${at}.patterns[${String(index)}] is not a valid regular expression`);\n      }\n    }\n  });\n}\n\nfunction parseKeywordFilter(value: unknown): KeywordFilterConfig | undefined {\n  if (value === undefined) return undefined;\n  validateKeywordFilter(value, 'ws client keywordFilter');\n  const raw = value as JsonObject;\n  const seen = new Set<string>();\n  const patterns: string[] = [];\n  for (const pattern of raw.patterns as string[]) {\n    if (seen.has(pattern)) continue;\n    seen.add(pattern);\n    patterns.push(pattern);\n  }\n  return clean({\n    mode: raw.mode as KeywordFilterConfig['mode'],\n    patterns,\n    regex: raw.regex === true ? true : undefined,\n    groupIds: Array.isArray(raw.groupIds) ? dedupePositiveIds(raw.groupIds as number[]) : undefined,\n  }) as KeywordFilterConfig;\n}\n\nfunction validateMessagePrefix(value: unknown, at: string): void {\n  if (value === undefined) return;\n  if (!isObject(value)) invalid(`${at} must be an object`);\n  rejectUnknownKeys(value, MESSAGE_PREFIX_KEYS, at);\n  if (typeof value.prefix !== 'string' || !value.prefix || value.prefix !== value.prefix.trim() || /[\\r\\n]/.test(value.prefix)) {\n    invalid(`${at}.prefix must be a non-empty trimmed single-line string`);\n  }\n  if (value.prefix.length > MESSAGE_PREFIX_MAX_LENGTH) {\n    invalid(`${at}.prefix must be at most ${MESSAGE_PREFIX_MAX_LENGTH} characters`);\n  }\n  validatePositiveIdArray(value.groupIds, `${at}.groupIds`, false);\n}\n\nfunction parseMessagePrefix(value: unknown): MessagePrefixConfig | undefined {\n  if (value === undefined) return undefined;\n  validateMessagePrefix(value, 'ws client messagePrefix');\n  const raw = value as JsonObject;\n  return {\n    prefix: raw.prefix as string,\n    groupIds: dedupePositiveIds(raw.groupIds as number[]),\n  };\n}\n"""
replace_once(old_keyword, new_keyword)

replace_once(
"""    if (n.keywordFilter.regex === true) keyword.regex = true;\n    out.keywordFilter = keyword;\n  }\n  return out;""",
"""    if (n.keywordFilter.regex === true) keyword.regex = true;\n    if (n.keywordFilter.groupIds !== undefined) {\n      keyword.groupIds = [...new Set(n.keywordFilter.groupIds)];\n    }\n    out.keywordFilter = keyword;\n  }\n  if (n.messagePrefix) {\n    out.messagePrefix = {\n      prefix: n.messagePrefix.prefix,\n      groupIds: [...new Set(n.messagePrefix.groupIds)],\n    };\n  }\n  return out;""",
)

replace_once(
"""    privateMessageFilter: parsePrivateMessageFilter(value.privateMessageFilter),\n    keywordFilter: parseKeywordFilter(value.keywordFilter),""",
"""    privateMessageFilter: parsePrivateMessageFilter(value.privateMessageFilter),\n    keywordFilter: parseKeywordFilter(value.keywordFilter),\n    messagePrefix: parseMessagePrefix(value.messagePrefix),""",
)

path.write_text(text, encoding='utf-8')
print(f'patched {path}')
