import { describe, expect, it } from 'vitest';
import { prepareOneBotConfigForRestore } from '../src/config';

function source(wsClient: Record<string, unknown>) {
  return {
    mode: 'snapshot',
    networks: {
      httpServers: [],
      httpClients: [],
      wsServers: [],
      wsClients: [{
        name: 'airi',
        url: 'ws://127.0.0.1:6199/ws',
        role: 'Universal',
        messageFormat: 'array',
        reportSelfMessage: false,
        ...wsClient,
      }],
    },
    statusCommand: { enabled: true, swallow: false, cooldownSeconds: 5, trigger: '#sl' },
    historySync: { enabled: false },
    notifications: { channelIds: [] },
  };
}

describe('WS client routing config restore', () => {
  it('preserves all per-client routing fields', () => {
    const restored = prepareOneBotConfigForRestore(source({
      groupMessageFilter: { mode: 'blacklist', groupIds: [123, 123, 456] },
      privateMessageFilter: { mode: 'whitelist', userIds: [10001, 10001] },
      keywordFilter: {
        mode: 'blacklist',
        patterns: ['广告', 'spam'],
        regex: false,
        groupIds: [123, 123],
      },
      messagePrefix: { prefix: '/airi', groupIds: [123, 123] },
    }), 'per-uin');

    const networks = restored.value.networks as Record<string, unknown>;
    const client = (networks.wsClients as Record<string, unknown>[])[0];
    expect(client.groupMessageFilter).toEqual({ mode: 'blacklist', groupIds: [123, 456] });
    expect(client.privateMessageFilter).toEqual({ mode: 'whitelist', userIds: [10001] });
    expect(client.keywordFilter).toEqual({
      mode: 'blacklist',
      patterns: ['广告', 'spam'],
      regex: false,
      groupIds: [123],
    });
    expect(client.messagePrefix).toEqual({ prefix: '/airi', groupIds: [123] });
  });

  it('keeps legacy keyword configuration without groupIds', () => {
    const restored = prepareOneBotConfigForRestore(source({
      keywordFilter: { mode: 'whitelist', patterns: ['hello'], regex: true },
    }), 'per-uin');
    const networks = restored.value.networks as Record<string, unknown>;
    const client = (networks.wsClients as Record<string, unknown>[])[0];
    expect(client.keywordFilter).toEqual({ mode: 'whitelist', patterns: ['hello'], regex: true });
  });

  it('rejects an enabled prefix with no target groups', () => {
    expect(() => prepareOneBotConfigForRestore(source({
      messagePrefix: { prefix: '/airi', groupIds: [] },
    }), 'per-uin')).toThrow(/messagePrefix|groupIds/i);
  });

  it('rejects blank or multiline prefixes', () => {
    expect(() => prepareOneBotConfigForRestore(source({
      messagePrefix: { prefix: '   ', groupIds: [123] },
    }), 'per-uin')).toThrow(/messagePrefix|prefix/i);
    expect(() => prepareOneBotConfigForRestore(source({
      messagePrefix: { prefix: '/airi\nnext', groupIds: [123] },
    }), 'per-uin')).toThrow(/messagePrefix|prefix/i);
  });

  it('rejects invalid group IDs in new routing fields', () => {
    expect(() => prepareOneBotConfigForRestore(source({
      keywordFilter: { mode: 'blacklist', patterns: ['x'], groupIds: [0] },
    }), 'per-uin')).toThrow(/groupIds/i);
    expect(() => prepareOneBotConfigForRestore(source({
      messagePrefix: { prefix: '/airi', groupIds: [-1] },
    }), 'per-uin')).toThrow(/groupIds/i);
  });
});
