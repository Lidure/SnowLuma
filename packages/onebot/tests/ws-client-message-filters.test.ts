import { describe, expect, it } from 'vitest';
import {
  applyMessagePrefix,
  extractMessageText,
  passesKeywordFilter,
  shouldDispatchPrivateMessage,
} from '../src/event-filter';
import type { JsonObject, KeywordFilterConfig, MessagePrefixConfig, PrivateMessageFilterConfig } from '../src/types';

function privateMessage(userId: number, text = 'hello'): JsonObject {
  return {
    post_type: 'message',
    message_type: 'private',
    user_id: userId,
    message: [{ type: 'text', data: { text } }],
    raw_message: text,
  };
}

function groupMessage(groupId: number, text = 'hello'): JsonObject {
  return {
    post_type: 'message',
    message_type: 'group',
    group_id: groupId,
    user_id: 10001,
    message: [{ type: 'text', data: { text } }],
    raw_message: text,
  };
}

const groupNotice: JsonObject = {
  post_type: 'notice',
  message_type: 'group',
  notice_type: 'group_increase',
  group_id: 985983966,
  user_id: 10001,
};

const blacklist: PrivateMessageFilterConfig = { mode: 'blacklist', userIds: [10001] };
const whitelist: PrivateMessageFilterConfig = { mode: 'whitelist', userIds: [10001] };

describe('shouldDispatchPrivateMessage', () => {
  it('passes every event when the filter is absent', () => {
    expect(shouldDispatchPrivateMessage(privateMessage(10001), undefined)).toBe(true);
  });

  it('supports blacklist and whitelist semantics', () => {
    expect(shouldDispatchPrivateMessage(privateMessage(10001), blacklist)).toBe(false);
    expect(shouldDispatchPrivateMessage(privateMessage(10002), blacklist)).toBe(true);
    expect(shouldDispatchPrivateMessage(privateMessage(10001), whitelist)).toBe(true);
    expect(shouldDispatchPrivateMessage(privateMessage(10002), whitelist)).toBe(false);
  });

  it('does not affect group messages or notice events', () => {
    expect(shouldDispatchPrivateMessage(groupMessage(985983966), blacklist)).toBe(true);
    expect(shouldDispatchPrivateMessage(groupNotice, blacklist)).toBe(true);
  });
});

describe('passesKeywordFilter', () => {
  const keywordBlacklist: KeywordFilterConfig = {
    mode: 'blacklist',
    patterns: ['广告', '推广'],
  };

  it('preserves legacy behavior without a group scope', () => {
    expect(passesKeywordFilter(groupMessage(1, '来点广告'), keywordBlacklist)).toBe(false);
    expect(passesKeywordFilter(groupMessage(2, '来点广告'), keywordBlacklist)).toBe(false);
    expect(passesKeywordFilter(privateMessage(10001, '广告'), keywordBlacklist)).toBe(false);
  });

  it('applies a scoped group keyword filter only to selected groups', () => {
    const scoped: KeywordFilterConfig = {
      mode: 'blacklist',
      patterns: ['广告'],
      groupIds: [985983966],
    };
    expect(passesKeywordFilter(groupMessage(985983966, '广告'), scoped)).toBe(false);
    expect(passesKeywordFilter(groupMessage(787682322, '广告'), scoped)).toBe(true);
  });

  it('still applies to private messages when a group scope is configured', () => {
    const scoped: KeywordFilterConfig = {
      mode: 'blacklist',
      patterns: ['广告'],
      groupIds: [985983966],
    };
    expect(passesKeywordFilter(privateMessage(10001, '广告'), scoped)).toBe(false);
  });

  it('treats an empty group scope as legacy all-groups behavior', () => {
    const scoped: KeywordFilterConfig = {
      mode: 'blacklist',
      patterns: ['广告'],
      groupIds: [],
    };
    expect(passesKeywordFilter(groupMessage(787682322, '广告'), scoped)).toBe(false);
  });

  it('matches regular expressions when enabled', () => {
    const regexFilter: KeywordFilterConfig = {
      mode: 'blacklist',
      patterns: ['广告|推广', '\\d{6,}'],
      regex: true,
    };
    expect(passesKeywordFilter(groupMessage(1, '群号 123456 速来'), regexFilter)).toBe(false);
    expect(passesKeywordFilter(groupMessage(1, '短号 123'), regexFilter)).toBe(true);
  });

  it('matches text segments when raw_message is missing', () => {
    const event: JsonObject = {
      post_type: 'message',
      message_type: 'group',
      group_id: 1,
      user_id: 10001,
      message: [
        { type: 'text', data: { text: '开头' } },
        { type: 'image', data: { file: 'x.jpg' } },
        { type: 'text', data: { text: '广告结尾' } },
      ],
    };
    expect(extractMessageText(event)).toBe('开头广告结尾');
    expect(passesKeywordFilter(event, keywordBlacklist)).toBe(false);
  });
});

describe('applyMessagePrefix', () => {
  const prefix: MessagePrefixConfig = { prefix: '/airi', groupIds: [985983966] };

  it('requires the prefix only in selected groups and strips it', () => {
    const input = groupMessage(985983966, '/airi   你好');
    const output = applyMessagePrefix(input, prefix);
    expect(output).not.toBeNull();
    expect(output).not.toBe(input);
    expect(output?.raw_message).toBe('你好');
    expect(output?.message).toEqual([{ type: 'text', data: { text: '你好' } }]);
    expect(input.raw_message).toBe('/airi   你好');
  });

  it('drops a selected-group message without the prefix', () => {
    expect(applyMessagePrefix(groupMessage(985983966, '你好'), prefix)).toBeNull();
  });

  it('leaves unselected groups and private messages untouched', () => {
    const other = groupMessage(787682322, '/airi 你好');
    const privateEvent = privateMessage(10001, '/airi 你好');
    expect(applyMessagePrefix(other, prefix)).toBe(other);
    expect(applyMessagePrefix(privateEvent, prefix)).toBe(privateEvent);
  });

  it('is exact and case-sensitive', () => {
    expect(applyMessagePrefix(groupMessage(985983966, '/AIRI 你好'), prefix)).toBeNull();
    expect(applyMessagePrefix(groupMessage(985983966, 'x/airi 你好'), prefix)).toBeNull();
  });

  it('handles prefix-only messages as an empty body', () => {
    const output = applyMessagePrefix(groupMessage(985983966, '/airi'), prefix);
    expect(output?.raw_message).toBe('');
    expect(output?.message).toEqual([{ type: 'text', data: { text: '' } }]);
  });

  it('preserves non-text segments while stripping the first textual prefix', () => {
    const input: JsonObject = {
      post_type: 'message',
      message_type: 'group',
      group_id: 985983966,
      user_id: 10001,
      raw_message: '/airi 你好[CQ:image,file=x.jpg]',
      message: [
        { type: 'text', data: { text: '/airi 你好' } },
        { type: 'image', data: { file: 'x.jpg' } },
      ],
    };
    const output = applyMessagePrefix(input, prefix);
    expect(output?.message).toEqual([
      { type: 'text', data: { text: '你好' } },
      { type: 'image', data: { file: 'x.jpg' } },
    ]);
  });

  it('does not mutate one client event while another client uses a different prefix', () => {
    const input = groupMessage(985983966, '/airi hello');
    const airi = applyMessagePrefix(input, prefix);
    const moe = applyMessagePrefix(input, { prefix: '/moe', groupIds: [985983966] });
    expect(airi?.raw_message).toBe('hello');
    expect(moe).toBeNull();
    expect(input.raw_message).toBe('/airi hello');
  });
});
