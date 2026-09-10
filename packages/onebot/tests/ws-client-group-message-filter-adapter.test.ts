import { describe, expect, it, vi } from 'vitest';

const { FakeWebSocket, instances } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as typeof import('node:events');
  const instances: FakeWebSocket[] = [];

  class FakeWebSocket extends EventEmitter {
    public readyState = 1;
    public readonly sent: string[] = [];

    constructor(public readonly url: string, _opts: unknown) {
      super();
      instances.push(this);
    }

    send(payload: string, cb?: (err?: Error | null) => void): void {
      this.sent.push(payload);
      cb?.(null);
    }

    close(): void {
      this.readyState = 3;
    }

    terminate(): void {
      this.readyState = 3;
      this.emit('close');
    }
  }

  return { FakeWebSocket, instances };
});

vi.mock('@snowluma/websocket', () => ({ WebSocket: FakeWebSocket }));

import { buildDispatchPayload } from '../src/event-filter';
import { NetworkReloadType, type NetworkAdapterContext } from '../src/network/adapter';
import { WsClientAdapter } from '../src/network/ws-client-adapter';
import type { JsonObject, WsClientNetwork } from '../src/types';

function ctx(): NetworkAdapterContext {
  return {
    uin: '10001',
    api: { processStreamRequest: async () => {} } as never,
    buildLifecycleEvent: () => ({}),
    buildHeartbeatEvent: () => ({}),
  };
}

function cfg(over: Partial<WsClientNetwork> = {}): WsClientNetwork {
  return {
    name: 'ws',
    enabled: true,
    url: 'ws://127.0.0.1:8080/ws',
    role: 'Universal',
    reconnectIntervalMs: 5000,
    messageFormat: 'array',
    reportSelfMessage: false,
    ...over,
  };
}

function groupMessage(groupId: number): JsonObject {
  return {
    post_type: 'message',
    message_type: 'group',
    group_id: groupId,
    user_id: 10001,
    message: [{ type: 'text', data: { text: 'hello' } }],
    raw_message: 'hello',
  };
}

function privateMessage(userId: number, text = 'hello'): JsonObject {
  return {
    post_type: 'message',
    message_type: 'private',
    user_id: userId,
    message: [{ type: 'text', data: { text } }],
    raw_message: text,
  };
}

describe('WsClientAdapter group message filter', () => {
  it('filters group messages independently for each ws client', () => {
    instances.length = 0;
    const event = groupMessage(985983966);
    const payload = buildDispatchPayload(event);

    const airi = new WsClientAdapter('airi', cfg({
      name: 'airi',
      url: 'ws://127.0.0.1:8081/ws',
      groupMessageFilter: { mode: 'blacklist', groupIds: [985983966] },
    }), ctx());
    const moe = new WsClientAdapter('moe', cfg({
      name: 'moe',
      url: 'ws://127.0.0.1:8082/ws',
      groupMessageFilter: { mode: 'blacklist', groupIds: [787682322] },
    }), ctx());

    airi.open();
    moe.open();
    airi.onEvent(event, payload);
    moe.onEvent(event, payload);

    expect(instances).toHaveLength(2);
    expect(instances[0].sent).toHaveLength(0);
    expect(instances[1].sent).toHaveLength(1);
  });

  it('hot-reloads only the filter without reopening the websocket', async () => {
    instances.length = 0;
    const adapter = new WsClientAdapter('airi', cfg({
      name: 'airi',
      groupMessageFilter: { mode: 'blacklist', groupIds: [985983966] },
    }), ctx());

    adapter.open();
    expect(instances).toHaveLength(1);

    const result = await adapter.reload(cfg({
      name: 'airi',
      groupMessageFilter: { mode: 'blacklist', groupIds: [787682322] },
    }));

    expect(result).toBe(NetworkReloadType.Normal);
    expect(instances).toHaveLength(1);

    const oldGroup = groupMessage(985983966);
    adapter.onEvent(oldGroup, buildDispatchPayload(oldGroup));
    expect(instances[0].sent).toHaveLength(1);

    const newBlockedGroup = groupMessage(787682322);
    adapter.onEvent(newBlockedGroup, buildDispatchPayload(newBlockedGroup));
    expect(instances[0].sent).toHaveLength(1);
  });
});

describe('WsClientAdapter private & keyword message filters', () => {
  it('filters private messages independently for each ws client', () => {
    instances.length = 0;
    const event = privateMessage(10001);
    const payload = buildDispatchPayload(event);

    const blocked = new WsClientAdapter('blocked', cfg({
      name: 'blocked',
      url: 'ws://127.0.0.1:8081/ws',
      privateMessageFilter: { mode: 'blacklist', userIds: [10001] },
    }), ctx());
    const allowed = new WsClientAdapter('allowed', cfg({
      name: 'allowed',
      url: 'ws://127.0.0.1:8082/ws',
      privateMessageFilter: { mode: 'blacklist', userIds: [10002] },
    }), ctx());

    blocked.open();
    allowed.open();
    blocked.onEvent(event, payload);
    allowed.onEvent(event, payload);

    expect(instances).toHaveLength(2);
    expect(instances[0].sent).toHaveLength(0);
    expect(instances[1].sent).toHaveLength(1);
  });

  it('drops keyword-blacklisted group and private messages but passes clean ones', () => {
    instances.length = 0;
    const adapter = new WsClientAdapter('airi', cfg({
      name: 'airi',
      keywordFilter: { mode: 'blacklist', patterns: ['广告'] },
    }), ctx());

    adapter.open();
    expect(instances).toHaveLength(1);

    const spam: JsonObject = { ...groupMessage(985983966), raw_message: '来点广告' };
    adapter.onEvent(spam, buildDispatchPayload(spam));
    expect(instances[0].sent).toHaveLength(0);

    const spamPrivate = privateMessage(10001, '还是广告');
    adapter.onEvent(spamPrivate, buildDispatchPayload(spamPrivate));
    expect(instances[0].sent).toHaveLength(0);

    const clean = privateMessage(10001, '日常聊天');
    adapter.onEvent(clean, buildDispatchPayload(clean));
    expect(instances[0].sent).toHaveLength(1);
  });

  it('combines group, private and keyword filters with AND semantics', () => {
    instances.length = 0;
    const adapter = new WsClientAdapter('airi', cfg({
      name: 'airi',
      groupMessageFilter: { mode: 'whitelist', groupIds: [985983966] },
      keywordFilter: { mode: 'blacklist', patterns: ['广告'] },
    }), ctx());

    adapter.open();

    // 非白名单群：拦截
    const wrongGroup = groupMessage(787682322);
    adapter.onEvent(wrongGroup, buildDispatchPayload(wrongGroup));
    // 白名单群但命中关键词：拦截
    const spam: JsonObject = { ...groupMessage(985983966), raw_message: '广告' };
    adapter.onEvent(spam, buildDispatchPayload(spam));
    // 白名单群且内容干净：放行
    const clean = groupMessage(985983966);
    adapter.onEvent(clean, buildDispatchPayload(clean));

    expect(instances[0].sent).toHaveLength(1);
  });
});
