import { describe, expect, it } from 'vitest';
import * as filterUtils from './group-message-filter-utils';
import {
  formatGroupIdsInput,
  formatKeywordPatternsInput,
  formatUserIdsInput,
  parseGroupIdsInput,
  parseKeywordPatternsInput,
  parseUserIdsInput,
} from './group-message-filter-utils';

describe('group message filter input', () => {
  it('accepts comma and whitespace separated group ids', () => {
    expect(parseGroupIdsInput('985983966, 787682322\n123456789')).toEqual({
      groupIds: [985983966, 787682322, 123456789],
    });
  });

  it('deduplicates ids while preserving order', () => {
    expect(parseGroupIdsInput('985983966,787682322,985983966')).toEqual({
      groupIds: [985983966, 787682322],
    });
  });

  it('accepts an empty list', () => {
    expect(parseGroupIdsInput('  ')).toEqual({ groupIds: [] });
  });

  it('rejects invalid values', () => {
    expect(parseGroupIdsInput('abc').error).toBeDefined();
    expect(parseGroupIdsInput('0').error).toBeDefined();
    expect(parseGroupIdsInput('-1').error).toBeDefined();
    expect(parseGroupIdsInput('1.5').error).toBeDefined();
    expect(parseGroupIdsInput(String(Number.MAX_SAFE_INTEGER + 1)).error).toBeDefined();
  });

  it('formats ids for editing', () => {
    expect(formatGroupIdsInput([985983966, 787682322])).toBe('985983966, 787682322');
    expect(formatGroupIdsInput(undefined)).toBe('');
  });
});

describe('private message filter input', () => {
  it('accepts comma and whitespace separated user ids', () => {
    expect(parseUserIdsInput('10001, 10002\n10003')).toEqual({
      userIds: [10001, 10002, 10003],
    });
  });

  it('deduplicates ids while preserving order', () => {
    expect(parseUserIdsInput('10001,10002,10001')).toEqual({
      userIds: [10001, 10002],
    });
  });

  it('rejects invalid values', () => {
    expect(parseUserIdsInput('abc').error).toBeDefined();
    expect(parseUserIdsInput('0').error).toBeDefined();
    expect(parseUserIdsInput('-1').error).toBeDefined();
  });

  it('formats ids for editing', () => {
    expect(formatUserIdsInput([10001, 10002])).toBe('10001, 10002');
  });
});

describe('keyword filter input', () => {
  it('parses one pattern per line and trims blanks', () => {
    expect(parseKeywordPatternsInput('广告\n\n  推广  \n', false)).toEqual({
      patterns: ['广告', '推广'],
    });
  });

  it('deduplicates patterns keeping first occurrence', () => {
    expect(parseKeywordPatternsInput('广告\n广告\n推广', false)).toEqual({
      patterns: ['广告', '推广'],
    });
  });

  it('keeps patterns containing commas intact', () => {
    expect(parseKeywordPatternsInput('a,b\nc', false)).toEqual({
      patterns: ['a,b', 'c'],
    });
  });

  it('accepts unparseable patterns when regex mode is off', () => {
    expect(parseKeywordPatternsInput('[invalid(', false)).toEqual({ patterns: ['[invalid('] });
  });

  it('rejects patterns that do not compile in regex mode', () => {
    expect(parseKeywordPatternsInput('ok\n[invalid(', true).error).toBeDefined();
  });

  it('accepts valid regex patterns in regex mode', () => {
    expect(parseKeywordPatternsInput('广告|推广\n\\d{6,}', true)).toEqual({
      patterns: ['广告|推广', '\\d{6,}'],
    });
  });

  it('formats patterns for editing', () => {
    expect(formatKeywordPatternsInput(['广告', '推广'])).toBe('广告\n推广');
    expect(formatKeywordPatternsInput(undefined)).toBe('');
  });
});

describe('routing multi-select helpers', () => {
  it('merges newly selected values without duplicates while preserving order', () => {
    const merge = (filterUtils as unknown as {
      mergeSelectedValues?: (current: string[], incoming: string[]) => string[];
    }).mergeSelectedValues;
    expect(merge).toBeTypeOf('function');
    expect(merge?.(['985983966'], ['787682322', '985983966'])).toEqual([
      '985983966',
      '787682322',
    ]);
  });

  it('keeps configured values that are no longer present in the live contact list', () => {
    const resolve = (filterUtils as unknown as {
      resolveSelectedOptions?: (
        values: string[],
        options: Array<{ value: string; label: string; sub?: string }>,
        fallbackLabel: string,
      ) => Array<{ value: string; label: string; sub?: string; missing?: boolean }>;
    }).resolveSelectedOptions;
    expect(resolve).toBeTypeOf('function');
    expect(resolve?.(
      ['985983966', '111222333'],
      [{ value: '985983966', label: 'Airi测试群', sub: '985983966' }],
      '未知群聊',
    )).toEqual([
      { value: '985983966', label: 'Airi测试群', sub: '985983966' },
      { value: '111222333', label: '未知群聊', sub: '111222333', missing: true },
    ]);
  });
});
