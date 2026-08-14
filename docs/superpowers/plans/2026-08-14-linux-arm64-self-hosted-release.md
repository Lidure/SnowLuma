# Linux ARM64 Self-Hosted Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-friendly local packaging workflow that builds the current custom SnowLuma branch for Raspberry Pi 5 / 64-bit Linux ARM64 as a self-contained `.tar.gz` with bundled Node.js 22.13.0.

**Architecture:** Reuse SnowLuma's existing `SNOWLUMA_TARGET=linux-arm64` build and official flat `dist/` release layout. A Node.js packaging script performs target build, artifact validation, Node ARM64 download/extraction, and final tarball creation; a thin BAT file provides a double-click Windows entry point. No GitHub Release or upstream PR is created.

**Tech Stack:** Node.js 22.13.0, pnpm 10.28.0, existing Vite monorepo build, Windows `tar.exe`/bsdtar, Node built-in `fetch`, `node:test`, GitHub-hosted Node.js binary archive.

## Global Constraints

- Target runtime is Raspberry Pi 5 / 64-bit Linux ARM64 (`linux-arm64`).
- Bundled Node.js version is read from `.node-version`; currently exactly `22.13.0`.
- pnpm version must remain exactly `10.28.0`.
- Generated packages stay local under `release/`; do not publish a public GitHub Release.
- Do not include `config/`, `data/`, logs, `.git`, source code, `node_modules`, Airi/Moe URLs, tokens, or private runtime data.
- Do not alter the existing WS Client group-message-filter behavior.
- Do not create or submit an upstream pull request.
- Fail closed: missing tools, failed downloads, failed builds, missing native binaries, or invalid archive contents must stop packaging.

---

## File Structure

- Create `tools/package-linux-arm64.mjs` — owns build orchestration, Node ARM64 download/extraction, release-layout checks, and `.tar.gz` creation. Exports pure helper functions so validation logic can be tested without network/build side effects.
- Create `tools/package-linux-arm64.test.mjs` — `node:test` coverage for naming, required layout validation, version parsing, and archive-content policy.
- Create `build_pi_release.bat` — Windows double-click entry point; checks the working directory/toolchain and calls the Node packaging script.
- Modify `.gitignore` — ignore `release/` so locally generated archives are never committed accidentally.
- Modify `README.md` — add a short custom/self-hosted ARM64 packaging note that points to `build_pi_release.bat` and Raspberry Pi extraction commands, without advertising a public modified release.

---

### Task 1: Add testable ARM64 release-layout helpers

**Files:**
- Create: `tools/package-linux-arm64.mjs`
- Create: `tools/package-linux-arm64.test.mjs`

**Interfaces:**
- Produces: `TARGET_TRIPLE`, `requiredReleasePaths`, `normalizeVersion(value)`, `nodeArchiveName(nodeVersion)`, `releaseArchiveName(appVersion)`, `assertRequiredReleaseFiles(rootDir)`, `assertForbiddenReleaseFiles(rootDir)`.
- Later tasks use these helpers from the same script's `main()` packaging flow.

- [ ] **Step 1: Write the failing helper tests**

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertForbiddenReleaseFiles,
  assertRequiredReleaseFiles,
  nodeArchiveName,
  normalizeVersion,
  releaseArchiveName,
} from './package-linux-arm64.mjs';

test('normalizes versions and names the ARM64 archives', () => {
  assert.equal(normalizeVersion('22.13.0\n'), '22.13.0');
  assert.equal(nodeArchiveName('22.13.0'), 'node-v22.13.0-linux-arm64.tar.xz');
  assert.equal(releaseArchiveName('1.14.4'), 'SnowLuma-Lidure-v1.14.4-linux-arm64.tar.gz');
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
```

- [ ] **Step 2: Run the tests and verify they fail because the module/functions do not exist yet**

Run:

```bash
node --test tools/package-linux-arm64.test.mjs
```

Expected: FAIL with module-not-found or missing-export errors.

- [ ] **Step 3: Implement the minimal pure helpers and constants**

`tools/package-linux-arm64.mjs` starts with:

```js
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';

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

export function releaseArchiveName(appVersion) {
  return `SnowLuma-Lidure-v${normalizeVersion(appVersion)}-linux-arm64.tar.gz`;
}

export async function assertRequiredReleaseFiles(rootDir) {
  const missing = [];
  for (const relative of requiredReleasePaths) {
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
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
node --test tools/package-linux-arm64.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the helper/test foundation**

```bash
git add tools/package-linux-arm64.mjs tools/package-linux-arm64.test.mjs
git commit -m "test: define linux arm64 release packaging checks"
```

---

### Task 2: Implement the Windows-hosted Linux ARM64 packager

**Files:**
- Modify: `tools/package-linux-arm64.mjs`
- Test: `tools/package-linux-arm64.test.mjs`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: executable `main()` flow that creates `release/SnowLuma-Lidure-v<version>-linux-arm64.tar.gz`.

- [ ] **Step 1: Add failing tests for Node download URL and safe staging layout**

Append tests:

```js
import { nodeDownloadUrl, stagedNodePath } from './package-linux-arm64.mjs';

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
```

- [ ] **Step 2: Run tests and verify new exports are missing**

Run:

```bash
node --test tools/package-linux-arm64.test.mjs
```

Expected: FAIL for `nodeDownloadUrl` / `stagedNodePath` missing exports.

- [ ] **Step 3: Implement command execution, target build, download, extraction, and packaging**

Add imports and functions using only Node built-ins plus the host `tar` command:

```js
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export function nodeDownloadUrl(nodeVersion) {
  const version = normalizeVersion(nodeVersion);
  return `https://nodejs.org/dist/v${version}/${nodeArchiveName(version)}`;
}

export function stagedNodePath(workDir, nodeVersion) {
  const version = normalizeVersion(nodeVersion);
  return path.join(workDir, `node-v${version}-linux-arm64`, 'bin', 'node');
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
```

`main()` must perform these exact operations in order:

```text
1. Resolve repo root from `import.meta.url`.
2. Read root package.json and `.node-version`.
3. Run `tar --version`; fail if unavailable.
4. Run `pnpm run build:all` with SNOWLUMA_TARGET=linux-arm64.
5. Run `pnpm check:release-layout`.
6. Validate required ARM64 dist files.
7. Validate forbidden top-level paths are absent from dist.
8. Create an OS temp work directory.
9. Download `https://nodejs.org/dist/v<version>/node-v<version>-linux-arm64.tar.xz` with `fetch` and reject non-2xx responses.
10. Save the archive to the temp directory.
11. Run `tar -xJf <archive> -C <workdir>`.
12. Verify extracted `bin/node` exists and has non-zero size.
13. Copy it to `dist/node`.
14. Re-run required-file validation, now including `node`.
15. Ensure `release/` exists and remove any stale archive with the same name.
16. Run `tar -czf <output> -C dist .`.
17. Verify output archive exists and has non-zero size.
18. Always remove the OS temp work directory in `finally`.
```

The script must only auto-run `main()` when invoked directly, so its pure helpers remain importable by `node:test`.

- [ ] **Step 4: Run helper tests again**

Run:

```bash
node --test tools/package-linux-arm64.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run a dry structural build without publishing anything**

Run from the repository root on Windows:

```bat
set SNOWLUMA_TARGET=linux-arm64&& pnpm run build:all
pnpm check:release-layout
```

Expected: build succeeds and `dist/native/` contains the Linux ARM64 SnowLuma, websocket, and ffmpeg addons.

- [ ] **Step 6: Commit the packager implementation**

```bash
git add tools/package-linux-arm64.mjs tools/package-linux-arm64.test.mjs
git commit -m "feat: package self-hosted linux arm64 release"
```

---

### Task 3: Add the double-click Windows entry point and prevent accidental archive commits

**Files:**
- Create: `build_pi_release.bat`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `node tools/package-linux-arm64.mjs` from Task 2.
- Produces: user-facing double-click packaging entry point.

- [ ] **Step 1: Add `release/` to `.gitignore`**

Append:

```gitignore
# locally generated self-hosted release archives
release/
```

- [ ] **Step 2: Create `build_pi_release.bat` with explicit tool checks**

```bat
@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title SnowLuma - Build Raspberry Pi ARM64 Release

echo ========================================
echo   SnowLuma Raspberry Pi ARM64 Builder
echo ========================================
echo.

where node >nul 2>nul || goto :missing_node
where corepack >nul 2>nul || goto :missing_corepack
where tar >nul 2>nul || goto :missing_tar

for /f "delims=" %%V in ('node -p "require('./package.json').packageManager"') do set PACKAGE_MANAGER=%%V
if /I not "%PACKAGE_MANAGER%"=="pnpm@10.28.0" (
  echo [ERROR] package.json requires pnpm@10.28.0, got %PACKAGE_MANAGER%.
  goto :failed
)

call corepack enable
if errorlevel 1 goto :failed
call corepack prepare pnpm@10.28.0 --activate
if errorlevel 1 goto :failed

if not exist node_modules (
  echo [INFO] Installing dependencies...
  call pnpm install --frozen-lockfile
  if errorlevel 1 goto :failed
)

echo [INFO] Building self-hosted Linux ARM64 package...
node tools\package-linux-arm64.mjs
if errorlevel 1 goto :failed

echo.
echo [OK] Package created under release\
pause
exit /b 0

:missing_node
echo [ERROR] Node.js is not installed. Install the project-supported Node.js first.
goto :failed

:missing_corepack
echo [ERROR] Corepack is not available.
goto :failed

:missing_tar
echo [ERROR] tar.exe is not available. Modern Windows 10/11 normally includes it.
goto :failed

:failed
echo.
echo [FAILED] Raspberry Pi ARM64 package was not created.
pause
exit /b 1
```

- [ ] **Step 3: Verify the BAT does not contain secrets or machine-specific paths**

Run:

```bat
findstr /I /C:"token" /C:"ws://" /C:"wss://" /C:"F:\\" build_pi_release.bat
```

Expected: no output.

- [ ] **Step 4: Commit the entry point and ignore rule**

```bash
git add build_pi_release.bat .gitignore
git commit -m "feat: add raspberry pi release build launcher"
```

---

### Task 4: Document local packaging and Raspberry Pi startup

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `build_pi_release.bat` and generated archive naming from Tasks 2-3.
- Produces: concise end-user instructions for this custom branch.

- [ ] **Step 1: Add a self-hosted ARM64 subsection under development/quick-start documentation**

Add content equivalent to:

```md
### 自用 Linux ARM64 / Raspberry Pi 5 打包

本分支包含个人自托管用的 Linux ARM64 打包入口。Windows 开发机双击 `build_pi_release.bat`，成功后会在 `release/` 生成：

`SnowLuma-Lidure-v<version>-linux-arm64.tar.gz`

将压缩包复制到 Raspberry Pi 5（64 位系统）后：

```bash
mkdir -p ~/snowluma
cd ~/snowluma
tar -xzf SnowLuma-Lidure-v<version>-linux-arm64.tar.gz
chmod +x launcher.sh node
./launcher.sh
```

随后访问 `http://<树莓派IP>:5099`。

完整包内置项目 `.node-version` 对应的 Linux ARM64 Node.js，无需在树莓派额外安装 pnpm 或源码依赖。该流程仅用于非商业自托管，不会自动发布修改版 Release。
```

- [ ] **Step 2: Verify README commands match the actual generated filename and launcher**

Run:

```bash
git grep -n "SnowLuma-Lidure-v<version>-linux-arm64.tar.gz\|build_pi_release.bat\|chmod +x launcher.sh node"
```

Expected: the three strings appear in the README and match implementation naming.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "docs: add raspberry pi self-hosted packaging guide"
```

---

### Task 5: Full verification of the custom branch

**Files:**
- Verify only; no unrelated source changes.

**Interfaces:**
- Consumes all previous tasks.
- Produces evidence that the packager is structurally correct and did not regress existing code.

- [ ] **Step 1: Run packaging helper tests**

```bash
node --test tools/package-linux-arm64.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run monorepo typecheck**

```bash
pnpm typecheck
```

Expected: PASS across all workspaces.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: 0 new errors. The previously observed unrelated warning in `packages/protocol/tests/msg-push/temp-message-source.test.ts` may remain.

- [ ] **Step 4: Run ARM64 build and release-layout verification**

Windows CMD:

```bat
set SNOWLUMA_TARGET=linux-arm64&& pnpm run build:all
pnpm check:release-layout
```

Expected: PASS and ARM64 native files present.

- [ ] **Step 5: Run the actual local packager**

```bat
node tools\package-linux-arm64.mjs
```

Expected: creates `release/SnowLuma-Lidure-v1.14.4-linux-arm64.tar.gz` (or the current package version) and reports success.

- [ ] **Step 6: Inspect final tarball contents**

```bat
tar -tzf release\SnowLuma-Lidure-v1.14.4-linux-arm64.tar.gz
```

Expected to include at least:

```text
./index.mjs
./launcher.sh
./check-node-version.cjs
./package.json
./node
./native/snowluma-linux-arm64.node
./native/snowluma-linux-arm64.so
./native/websocket-linux-arm64.node
./native/ffmpeg/ffmpegAddon.linux.arm64.node
```

Expected NOT to include `.git`, `packages/`, `src/`, `config/`, `data/`, `logs/`, or root `node_modules/`.

- [ ] **Step 7: Confirm working tree contains only intended tracked changes**

```bash
git status --short
git diff --check
```

Expected: clean after commits; `release/` remains ignored.

- [ ] **Step 8: Raspberry Pi runtime smoke test after copying the archive**

On Raspberry Pi 5 / 64-bit Linux:

```bash
uname -m
# expected: aarch64

mkdir -p ~/snowluma-test
cd ~/snowluma-test
tar -xzf /path/to/SnowLuma-Lidure-v<version>-linux-arm64.tar.gz
chmod +x launcher.sh node
./node --version
# expected: v22.13.0 (or the exact current .node-version)

./launcher.sh
```

Expected: SnowLuma starts and WebUI is reachable at `http://<树莓派IP>:5099`. Verify the existing custom WS Client group filter is visible and behaves as before.

- [ ] **Step 9: Do not create an upstream PR or public GitHub Release**

No command is run for PR/Release publication. Any future upstream submission requires explicit user approval first.
