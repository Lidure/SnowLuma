import { describe, expect, it } from 'vitest';
import {
  applyMessagePrefix,
  passesKeywordFilter,
  shouldDispatchGroupMessage,
  shouldDispatchPrivateMessage,
} from '../src/event-filter';
import type {
  GroupMessageFilterConfig,
  JsonObject,
  KeywordFilterConfig,
  MessagePrefixConfig,
  PrivateMessageFilterConfig,
} from '../src/types';

function groupMessage(groupId: number, text: string): JsonObject {
  return {
    post_type: 'message',
    message_type: 'group',
    group_id: groupId,
    user_id: 10001,
    raw_message: text,
    message: [{ type: 'text', data: { text } }],
  };
}

function privateMessage(userId: number, text: string): JsonObject {
  return {
    post_type: 'message',
    message_type: 'private',
    user_id: userId,
    raw_message: text,
    message: [{ type: 'text', data: { text } }],
  };
}

describe('legacy per-client id filters', () => {
  it('supports group blacklist/whitelist semantics', () => {
    const black: GroupMessageFilterConfig = { mode: 'blacklist', groupIds: [123] };
    const white: GroupMessageFilterConfig = { mode: 'whitelist', groupIds: [123] };
    expect(shouldDispatchGroupMessage(groupMessage(123, 'x'), black)).toBe(false);
    expect(shouldDispatchGroupMessage(groupMessage(456, 'x'), black)).toBe(true);
    expect(shouldDispatchGroupMessage(groupMessage(123, 'x'), white)).toBe(true);
    expect(shouldDispatchGroupMessage(groupMessage(456, 'x'), white)).toBe(false);
  });

  it('supports private sender blacklist/whitelist semantics', () => {
    const black: PrivateMessageFilterConfig = { mode: 'blacklist', userIds: [10001] };
    const white: PrivateMessageFilterConfig = { mode: 'whitelist', userIds: [10001] };
    expect(shouldDispatchPrivateMessage(privateMessage(10001, 'x'), black)).toBe(false);
    expect(shouldDispatchPrivateMessage(privateMessage(10002, 'x'), black)).toBe(true);
    expect(shouldDispatchPrivateMessage(privateMessage(10001, 'x'), white)).toBe(true);
    expect(shouldDispatchPrivateMessage(privateMessage(10002, 'x'), white)).toBe(false);
  });
});

describe('scoped keyword filtering', () => {
  const filter: KeywordFilterConfig = {
    mode: 'blacklist',
    patterns: ['广告'],
    groupIds: [123],
  };

  it('applies keyword filtering in selected groups', () => {
    expect(passesKeywordFilter(groupMessage(123, '这是广告'), filter)).toBe(false);
  });

  it('bypasses keyword filtering in unselected groups', () => {
    expect(passesKeywordFilter(groupMessage(456, '这是广告'), filter)).toBe(true);
  });

  it('still applies keyword filtering to private messages', () => {
    expect(passesKeywordFilter(privateMessage(10001, '这是广告'), filter)).toBe(false);
  });

  it('keeps legacy all-groups behavior when groupIds is absent or empty', () => {
    expect(passesKeywordFilter(groupMessage(456, '这是广告'), { mode: 'blacklist', patterns: ['广告'] })).toBe(false);
    expect(passesKeywordFilter(groupMessage(456, '这是广告'), { mode: 'blacklist', patterns: ['广告'], groupIds: [] })).toBe(false);
  });
});

describe('per-client message prefix routing', () => {
  const prefix: MessagePrefixConfig = { prefix: '/airi', groupIds: [123] };

  it('drops selected-group messages without the prefix', () => {
    expect(applyMessagePrefix(groupMessage(123, 'hello'), prefix)).toBeNull();
  });

  it('strips one exact leading prefix and following whitespace', () => {
    const original = groupMessage(123, '/airi   hello');
    const transformed = applyMessagePrefix(original, prefix);
    expect(transformed).not.toBeNull();
    expect(transformed?.raw_message).toBe('hello');
    expect((transformed?.message as JsonObject[])[0]).toEqual({ type: 'text', data: { text: 'hello' } });
    expect(original.raw_message).toBe('/airi   hello');
  });

  it('is exact and case-sensitive', () => {
    expect(applyMessagePrefix(groupMessage(123, '/Airi hello'), prefix)).toBeNull();
  });

  it('bypasses unselected groups and private messages unchanged', () => {
    const otherGroup = groupMessage(456, 'hello');
    const dm = privateMessage(10001, 'hello');
    expect(applyMessagePrefix(otherGroup, prefix)).toBe(otherGroup);
    expect(applyMessagePrefix(dm, prefix)).toBe(dm);
  });

  it('preserves non-text segments while rewriting the first text segment', () => {
    const original: JsonObject = {
      post_type: 'message',
      message_type: 'group',
      group_id: 123,
      user_id: 10001,
      raw_message: '/airi hello[CQ:image,file=x.jpg]',
      message: [
        { type: 'text', data: { text: '/airi hello' } },
        { type: 'image', data: { file: 'x.jpg' } },
      ],
    };
    const transformed = applyMessagePrefix(original, prefix);
    expect(transformed?.raw_message).toBe('hello[CQ:image,file=x.jpg]');
    expect(transformed?.message).toEqual([
      { type: 'text', data: { text: 'hello' } },
      { type: 'image', data: { file: 'x.jpg' } },
    ]);
  });

  it('supports prefix-only messages', () => {
    const transformed = applyMessagePrefix(groupMessage(123, '/airi'), prefix);
    expect(transformed?.raw_message).toBe('');
    expect((transformed?.message as JsonObject[])[0]).toEqual({ type: 'text', data: { text: '' } });
  });
});
