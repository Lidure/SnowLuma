import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertForbiddenReleaseFiles,
  assertRequiredReleaseFiles,
  nodeArchiveName,
  nodeDownloadUrl,
  normalizeVersion,
  releaseArchiveName,
  stagedNodePath,
} from './package-linux-arm64.mjs';

test('normalizes versions and names the ARM64 archives', () => {
  assert.equal(normalizeVersion('22.13.0\n'), '22.13.0');
  assert.equal(nodeArchiveName('22.13.0'), 'node-v22.13.0-linux-arm64.tar.xz');
  assert.equal(releaseArchiveName('1.14.4'), 'SnowLuma-Lidure-v1.14.4-linux-arm64.tar.gz');
});

test('uses the official Node.js linux-arm64 archive URL', () => {
  assert.equal(
    nodeDownloadUrl('22.13.0'),
    'https://nodejs.org/dist/v22.13.0/node-v22.13.0-linux-arm64.tar.xz',
  );
});

test('resolves the extracted Node binary inside the official archive root', () => {
  assert.equal(
    stagedNodePath('/tmp/work', '22.13.0'),
    path.join('/tmp/work', 'node-v22.13.0-linux-arm64', 'bin', 'node'),
  );
});

test('required release validation reports a missing file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'snowluma-release-test-'));
  await assert.rejects(() => assertRequiredReleaseFiles(root), /missing required release files/i);
});

test('forbidden release validation rejects private/runtime development paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'snowluma-release-test-'));
  await mkdir(path.join(root, 'config'), { recursive: true });
  await writeFile(path.join(root, 'config', 'onebot.json'), '{}');
  await assert.rejects(() => assertForbiddenReleaseFiles(root), /forbidden release path/i);
});
