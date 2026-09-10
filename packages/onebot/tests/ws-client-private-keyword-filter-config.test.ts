import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertValidOneBotConfig,
  loadOneBotConfig,
  makeDefaultOneBotConfig,
  prepareOneBotConfigForRestore,
  saveOneBotConfig,
} from '../src/config';

describe('ws client private & keyword filter config', () => {
  let tempDir: string;
  let previousCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snowluma-onebot-msg-filter-'));
    previousCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('round-trips private and keyword filters on a ws client', () => {
    const config = makeDefaultOneBotConfig();
    config.networks.wsClients.push({
      name: 'airi',
      url: 'wss://example.com/onebot/v11/ws',
      role: 'Universal',
      reconnectIntervalMs: 5000,
      messageFormat: 'array',
      reportSelfMessage: false,
      privateMessageFilter: {
        mode: 'whitelist',
        userIds: [10001, 10002, 10001],
      },
      keywordFilter: {
        mode: 'blacklist',
        patterns: ['广告', '\\d{6,}', '广告'],
        regex: true,
      },
    });

    saveOneBotConfig('10001', config);
    const reloaded = loadOneBotConfig('10001');

    expect(reloaded.networks.wsClients[0].privateMessageFilter).toEqual({
      mode: 'whitelist',
      userIds: [10001, 10002],
    });
    expect(reloaded.networks.wsClients[0].keywordFilter).toEqual({
      mode: 'blacklist',
      patterns: ['广告', '\\d{6,}'],
      regex: true,
    });
  });

  it('omits the regex flag when it is not enabled', () => {
    const config = makeDefaultOneBotConfig();
    config.networks.wsClients.push({
      name: 'airi',
      url: 'wss://example.com/onebot/v11/ws',
      messageFormat: 'array',
      reportSelfMessage: false,
      keywordFilter: { mode: 'blacklist', patterns: ['广告'] },
    });

    saveOneBotConfig('10001', config);
    const reloaded = loadOneBotConfig('10001');

    expect(reloaded.networks.wsClients[0].keywordFilter).toEqual({
      mode: 'blacklist',
      patterns: ['广告'],
    });
  });

  it('rejects malformed private message filters', () => {
    const invalidValues: unknown[] = [
      null,
      { mode: 'deny', userIds: [10001] },
      { mode: 'blacklist', userIds: '10001' },
      { mode: 'blacklist', userIds: [0] },
      { mode: 'blacklist', userIds: [-1] },
      { mode: 'blacklist', userIds: [1.5] },
      { mode: 'blacklist', userIds: [Number.MAX_SAFE_INTEGER + 1] },
      { mode: 'blacklist', userIds: [10001], extra: true },
    ];

    for (const privateMessageFilter of invalidValues) {
      const config = makeDefaultOneBotConfig();
      config.networks.wsClients.push({
        name: 'bad-filter',
        url: 'ws://127.0.0.1:8080/ws',
        messageFormat: 'array',
        reportSelfMessage: false,
        privateMessageFilter,
      } as never);

      expect(() => assertValidOneBotConfig(config)).toThrow(/privateMessageFilter/);
    }
  });

  it('rejects malformed keyword filters', () => {
    const invalidValues: unknown[] = [
      null,
      { mode: 'deny', patterns: ['广告'] },
      { mode: 'blacklist', patterns: '广告' },
      { mode: 'blacklist', patterns: [''] },
      { mode: 'blacklist', patterns: [123] },
      { mode: 'blacklist', patterns: ['广告'], regex: 'yes' },
      { mode: 'blacklist', patterns: ['[invalid('], regex: true },
      { mode: 'blacklist', patterns: ['x'.repeat(257)] },
    ];

    for (const keywordFilter of invalidValues) {
      const config = makeDefaultOneBotConfig();
      config.networks.wsClients.push({
        name: 'bad-filter',
        url: 'ws://127.0.0.1:8080/ws',
        messageFormat: 'array',
        reportSelfMessage: false,
        keywordFilter,
      } as never);

      expect(() => assertValidOneBotConfig(config)).toThrow(/keywordFilter/);
    }
  });

  it('accepts valid filters and rejects malformed ones during restore', () => {
    const valid = {
      mode: 'snapshot',
      networks: {
        httpServers: [],
        httpClients: [],
        wsServers: [],
        wsClients: [{
          name: 'airi',
          url: 'wss://example.com/ws',
          messageFormat: 'array',
          reportSelfMessage: false,
          privateMessageFilter: { mode: 'blacklist', userIds: [10001] },
          keywordFilter: { mode: 'whitelist', patterns: ['上报', '排行'], regex: false },
        }],
      },
      statusCommand: { enabled: true, swallow: false, cooldownSeconds: 5, trigger: '#sl' },
      historySync: { enabled: false },
      notifications: { channelIds: [] },
    };

    expect(() => prepareOneBotConfigForRestore(valid, 'per-uin')).not.toThrow();

    const badPrivate = structuredClone(valid);
    badPrivate.networks.wsClients[0].privateMessageFilter = {
      mode: 'blacklist',
      userIds: ['10001'],
    } as never;
    expect(() => prepareOneBotConfigForRestore(badPrivate, 'per-uin'))
      .toThrow(/privateMessageFilter/);

    const badKeyword = structuredClone(valid);
    badKeyword.networks.wsClients[0].keywordFilter = {
      mode: 'whitelist',
      patterns: ['ok', '[invalid('],
      regex: true,
    } as never;
    expect(() => prepareOneBotConfigForRestore(badKeyword, 'per-uin'))
      .toThrow(/keywordFilter/);
  });
});
