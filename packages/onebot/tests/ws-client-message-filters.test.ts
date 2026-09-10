import { describe, expect, it } from 'vitest';
import {
  extractMessageText,
  passesKeywordFilter,
  shouldDispatchPrivateMessage,
} from '../src/event-filter';
import type { JsonObject, KeywordFilterConfig, PrivateMessageFilterConfig } from '../src/types';

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

const blacklist: PrivateMessageFilterConfig = {
  mode: 'blacklist',
  userIds: [10001],
};

const whitelist: PrivateMessageFilterConfig = {
  mode: 'whitelist',
  userIds: [10001],
};

describe('shouldDispatchPrivateMessage', () => {
  it('passes every event when the filter is absent', () => {
    expect(shouldDispatchPrivateMessage(privateMessage(10001), undefined)).toBe(true);
  });

  it('blocks matching blacklist users and passes other users', () => {
    expect(shouldDispatchPrivateMessage(privateMessage(10001), blacklist)).toBe(false);
    expect(shouldDispatchPrivateMessage(privateMessage(10002), blacklist)).toBe(true);
  });

  it('passes matching whitelist users and blocks other users', () => {
    expect(shouldDispatchPrivateMessage(privateMessage(10001), whitelist)).toBe(true);
    expect(shouldDispatchPrivateMessage(privateMessage(10002), whitelist)).toBe(false);
  });

  it('blocks every private message for an empty whitelist', () => {
    expect(shouldDispatchPrivateMessage(privateMessage(10001), {
      mode: 'whitelist',
      userIds: [],
    })).toBe(false);
  });

  it('does not affect group messages or notice events', () => {
    expect(shouldDispatchPrivateMessage(groupMessage(985983966), blacklist)).toBe(true);
    expect(shouldDispatchPrivateMessage(groupNotice, blacklist)).toBe(true);
  });

  it('passes private messages with an unusable user id', () => {
    const weird: JsonObject = { ...privateMessage(0), user_id: '10001' };
    expect(shouldDispatchPrivateMessage(weird, blacklist)).toBe(true);
  });
});

describe('passesKeywordFilter', () => {
  const keywordBlacklist: KeywordFilterConfig = {
    mode: 'blacklist',
    patterns: ['广告', '推广'],
  };

  const keywordWhitelist: KeywordFilterConfig = {
    mode: 'whitelist',
    patterns: ['上报', '排行'],
  };

  it('passes every event when the filter is absent', () => {
    expect(passesKeywordFilter(groupMessage(1, '广告'), undefined)).toBe(true);
  });

  it('drops blacklist matches and passes non-matches', () => {
    expect(passesKeywordFilter(groupMessage(1, '来点广告'), keywordBlacklist)).toBe(false);
    expect(passesKeywordFilter(groupMessage(1, '日常聊天'), keywordBlacklist)).toBe(true);
  });

  it('applies to private messages too', () => {
    expect(passesKeywordFilter(privateMessage(10001, '广告时间'), keywordBlacklist)).toBe(false);
    expect(passesKeywordFilter(privateMessage(10001, '日常聊天'), keywordBlacklist)).toBe(true);
  });

  it('only passes whitelist matches', () => {
    expect(passesKeywordFilter(groupMessage(1, '今日上报'), keywordWhitelist)).toBe(true);
    expect(passesKeywordFilter(groupMessage(1, '日常聊天'), keywordWhitelist)).toBe(false);
  });

  it('blocks everything for an empty whitelist and nothing for an empty blacklist', () => {
    const emptyWhite: KeywordFilterConfig = { mode: 'whitelist', patterns: [] };
    const emptyBlack: KeywordFilterConfig = { mode: 'blacklist', patterns: [] };
    expect(passesKeywordFilter(groupMessage(1), emptyWhite)).toBe(false);
    expect(passesKeywordFilter(groupMessage(1), emptyBlack)).toBe(true);
  });

  it('matches regular expressions when regex is enabled', () => {
    const regexFilter: KeywordFilterConfig = {
      mode: 'blacklist',
      patterns: ['广告|推广', '\\d{6,}'],
      regex: true,
    };
    expect(passesKeywordFilter(groupMessage(1, '群号 123456 速来'), regexFilter)).toBe(false);
    expect(passesKeywordFilter(groupMessage(1, '短号 123'), regexFilter)).toBe(true);
  });

  it('treats an uncompilable regex as never matching', () => {
    const badRegex: KeywordFilterConfig = {
      mode: 'blacklist',
      patterns: ['[invalid('],
      regex: true,
    };
    expect(passesKeywordFilter(groupMessage(1, '广告'), badRegex)).toBe(true);
  });

  it('does not affect notice events', () => {
    expect(passesKeywordFilter(groupNotice, keywordBlacklist)).toBe(true);
  });

  it('matches against text segments when raw_message is missing', () => {
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

  it('matches against a string message (CQ code) when raw_message is missing', () => {
    const event: JsonObject = {
      post_type: 'message',
      message_type: 'private',
      user_id: 10001,
      message: '来点广告 [CQ:face,id=1]',
    };
    expect(extractMessageText(event)).toBe('来点广告 [CQ:face,id=1]');
    expect(passesKeywordFilter(event, keywordBlacklist)).toBe(false);
  });
});
