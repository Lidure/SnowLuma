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

function privateMessage(userId: number, text = 'hello'): JsonObject {
  return {
    post_type: 'message',
    message_type: 'private',
    user_id: userId,
    message: [{ type: 'text', data: { text } }],
    raw_message: text,
  };
}

describe('WsClientAdapter filters', () => {
  it('filters group messages independently for each ws client', () => {
    instances.length = 0;
    const event = groupMessage(985983966);
    const payload = buildDispatchPayload(event);
    const airi = new WsClientAdapter('airi', cfg({
      name: 'airi', url: 'ws://127.0.0.1:8081/ws',
      groupMessageFilter: { mode: 'blacklist', groupIds: [985983966] },
    }), ctx());
    const moe = new WsClientAdapter('moe', cfg({
      name: 'moe', url: 'ws://127.0.0.1:8082/ws',
      groupMessageFilter: { mode: 'blacklist', groupIds: [787682322] },
    }), ctx());
    airi.open();
    moe.open();
    airi.onEvent(event, payload);
    moe.onEvent(event, payload);
    expect(instances[0].sent).toHaveLength(0);
    expect(instances[1].sent).toHaveLength(1);
  });

  it('applies keyword filtering only in selected groups', () => {
    instances.length = 0;
    const adapter = new WsClientAdapter('airi', cfg({
      keywordFilter: { mode: 'blacklist', patterns: ['广告'], groupIds: [985983966] },
    }), ctx());
    adapter.open();
    const selected = groupMessage(985983966, '广告');
    const other = groupMessage(787682322, '广告');
    adapter.onEvent(selected, buildDispatchPayload(selected));
    adapter.onEvent(other, buildDispatchPayload(other));
    expect(instances[0].sent).toHaveLength(1);
    expect(JSON.parse(instances[0].sent[0]).group_id).toBe(787682322);
  });

  it('routes the same original event independently to clients with different prefixes', () => {
    instances.length = 0;
    const event = groupMessage(985983966, '/airi 你好');
    const payload = buildDispatchPayload(event);
    const airi = new WsClientAdapter('airi', cfg({
      name: 'airi', url: 'ws://127.0.0.1:8081/ws',
      messagePrefix: { prefix: '/airi', groupIds: [985983966] },
    }), ctx());
    const moe = new WsClientAdapter('moe', cfg({
      name: 'moe', url: 'ws://127.0.0.1:8082/ws',
      messagePrefix: { prefix: '/moe', groupIds: [985983966] },
    }), ctx());
    airi.open();
    moe.open();
    airi.onEvent(event, payload);
    moe.onEvent(event, payload);

    expect(instances[0].sent).toHaveLength(1);
    expect(instances[1].sent).toHaveLength(0);
    const received = JSON.parse(instances[0].sent[0]);
    expect(received.raw_message).toBe('你好');
    expect(received.message).toEqual([{ type: 'text', data: { text: '你好' } }]);
    expect(event.raw_message).toBe('/airi 你好');
  });

  it('strips the prefix in string message format too', () => {
    instances.length = 0;
    const event = groupMessage(985983966, '/airi hello');
    const adapter = new WsClientAdapter('airi', cfg({
      messageFormat: 'string',
      messagePrefix: { prefix: '/airi', groupIds: [985983966] },
    }), ctx());
    adapter.open();
    adapter.onEvent(event, buildDispatchPayload(event));
    const received = JSON.parse(instances[0].sent[0]);
    expect(received.message).toBe('hello');
    expect(received.raw_message).toBe('hello');
  });

  it('does not require the configured prefix outside selected groups or in private chat', () => {
    instances.length = 0;
    const adapter = new WsClientAdapter('airi', cfg({
      messagePrefix: { prefix: '/airi', groupIds: [985983966] },
    }), ctx());
    adapter.open();
    const other = groupMessage(787682322, '普通消息');
    const privateEvent = privateMessage(10001, '普通私聊');
    adapter.onEvent(other, buildDispatchPayload(other));
    adapter.onEvent(privateEvent, buildDispatchPayload(privateEvent));
    expect(instances[0].sent).toHaveLength(2);
  });

  it('hot-reloads filters and prefix rules without reopening the websocket', async () => {
    instances.length = 0;
    const adapter = new WsClientAdapter('airi', cfg({
      keywordFilter: { mode: 'blacklist', patterns: ['旧'], groupIds: [985983966] },
      messagePrefix: { prefix: '/airi', groupIds: [985983966] },
    }), ctx());
    adapter.open();
    expect(instances).toHaveLength(1);

    const result = await adapter.reload(cfg({
      keywordFilter: { mode: 'blacklist', patterns: ['新'], groupIds: [985983966] },
      messagePrefix: { prefix: '/new', groupIds: [985983966] },
    }));
    expect(result).toBe(NetworkReloadType.Normal);
    expect(instances).toHaveLength(1);

    const oldPrefix = groupMessage(985983966, '/airi hello');
    adapter.onEvent(oldPrefix, buildDispatchPayload(oldPrefix));
    expect(instances[0].sent).toHaveLength(0);
    const newPrefix = groupMessage(985983966, '/new hello');
    adapter.onEvent(newPrefix, buildDispatchPayload(newPrefix));
    expect(instances[0].sent).toHaveLength(1);
  });
});
