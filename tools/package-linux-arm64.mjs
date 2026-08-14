import { spawn } from 'node:child_process';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TARGET_TRIPLE = 'linux-arm64';

export const requiredReleasePaths = [
  'index.mjs',
  'launcher.sh',
  'check-node-version.cjs',
  'package.json',
  'EULA.md',
  'PRIVACY.md',
  'native/snowluma-linux-arm64.node',
  'native/snowluma-linux-arm64.so',
  'native/websocket-linux-arm64.node',
  'native/ffmpeg/ffmpegAddon.linux.arm64.node',
];

const forbiddenTopLevelNames = new Set([
  '.git', 'config', 'data', 'logs', 'node_modules', 'packages', 'src',
]);

export function normalizeVersion(value) {
  const version = String(value).trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`invalid version: ${JSON.stringify(value)}`);
  }
  return version;
}

export function nodeArchiveName(nodeVersion) {
  return `node-v${normalizeVersion(nodeVersion)}-linux-arm64.tar.xz`;
}

export function nodeDownloadUrl(nodeVersion) {
  const version = normalizeVersion(nodeVersion);
  return `https://nodejs.org/dist/v${version}/${nodeArchiveName(version)}`;
}

export function stagedNodePath(workDir, nodeVersion) {
  const version = normalizeVersion(nodeVersion);
  return path.join(workDir, `node-v${version}-linux-arm64`, 'bin', 'node');
}

export function releaseArchiveName(appVersion) {
  return `SnowLuma-Lidure-v${normalizeVersion(appVersion)}-linux-arm64.tar.gz`;
}

export function pnpmSpawnSpec(args, platform = process.platform) {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', ...args],
    };
  }
  return { command: 'pnpm', args };
}

export async function assertRequiredReleaseFiles(rootDir, extraRequired = []) {
  const missing = [];
  for (const relative of [...requiredReleasePaths, ...extraRequired]) {
    try { await access(path.join(rootDir, relative)); }
    catch { missing.push(relative); }
  }
  if (missing.length) {
    throw new Error(`Missing required release files:\n${missing.map((p) => `  - ${p}`).join('\n')}`);
  }
}

export async function assertForbiddenReleaseFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const forbidden = entries
    .map((entry) => entry.name)
    .filter((name) => forbiddenTopLevelNames.has(name));
  if (forbidden.length) {
    throw new Error(`Forbidden release path(s): ${forbidden.join(', ')}`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function runPnpm(args, options = {}) {
  const spec = pnpmSpawnSpec(args);
  return run(spec.command, spec.args, options);
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Node.js download failed: HTTP ${response.status} ${response.statusText}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0) throw new Error('Node.js download returned an empty archive');
  await writeFile(destination, data);
}

export async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const distDir = path.join(repoRoot, 'dist');
  const releaseDir = path.join(repoRoot, 'release');

  const rootPkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const appVersion = normalizeVersion(rootPkg.version);
  const nodeVersion = normalizeVersion(await readFile(path.join(repoRoot, '.node-version'), 'utf8'));
  const outputPath = path.join(releaseDir, releaseArchiveName(appVersion));

  console.log(`[INFO] Target: ${TARGET_TRIPLE}`);
  console.log(`[INFO] SnowLuma: v${appVersion}`);
  console.log(`[INFO] Bundled Node.js: v${nodeVersion}`);

  await run('tar', ['--version'], { cwd: repoRoot });
  await runPnpm(['run', 'build:all'], {
    cwd: repoRoot,
    env: { ...process.env, SNOWLUMA_TARGET: TARGET_TRIPLE },
  });
  await runPnpm(['check:release-layout'], { cwd: repoRoot });

  await assertRequiredReleaseFiles(distDir);
  await assertForbiddenReleaseFiles(distDir);

  const workDir = await mkdtemp(path.join(os.tmpdir(), 'snowluma-linux-arm64-'));
  try {
    const archiveName = nodeArchiveName(nodeVersion);
    const archivePath = path.join(workDir, archiveName);
    console.log(`[INFO] Downloading ${nodeDownloadUrl(nodeVersion)}`);
    await downloadFile(nodeDownloadUrl(nodeVersion), archivePath);
    await run('tar', ['-xJf', archivePath, '-C', workDir], { cwd: repoRoot });

    const sourceNode = stagedNodePath(workDir, nodeVersion);
    const sourceStat = await stat(sourceNode);
    if (!sourceStat.isFile() || sourceStat.size === 0) {
      throw new Error(`Extracted Node.js binary is invalid: ${sourceNode}`);
    }

    await copyFile(sourceNode, path.join(distDir, 'node'));
    await assertRequiredReleaseFiles(distDir, ['node']);
    await assertForbiddenReleaseFiles(distDir);

    await mkdir(releaseDir, { recursive: true });
    await rm(outputPath, { force: true });
    await run('tar', ['-czf', outputPath, '-C', distDir, '.'], { cwd: repoRoot });

    const outputStat = await stat(outputPath);
    if (!outputStat.isFile() || outputStat.size === 0) {
      throw new Error(`Release archive was not created correctly: ${outputPath}`);
    }

    console.log(`[OK] Created: ${outputPath}`);
    return outputPath;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
