# WS Client Scoped Keyword and Prefix Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the private WS-client filtering customization onto current upstream `dev`, then add group-scoped keyword filtering and per-client group-scoped prefix routing with prefix stripping.

**Architecture:** Preserve upstream OneBot dispatch architecture and keep policy in the WS-client adapter layer. Configuration remains per `WsClientNetwork`; pure filter/transform helpers operate on immutable event copies, and the adapter serializes a transformed event only for the client whose prefix rule matched.

**Tech Stack:** TypeScript, Node.js, Vitest, React/TSX WebUI, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-09-28-ws-client-scoped-keywords-prefix-design.md`

## Global Constraints

- Base implementation on current upstream `SnowLuma/SnowLuma` `dev`; inspected head at planning time: `93b5c1b4bf148cf14025b4b7f3970db70d818890`.
- Preserve existing private group/private/keyword WS-client filtering and Raspberry Pi ARM64 packaging.
- No upstream PR or public release without explicit user approval.
- Existing configurations without new fields retain current behavior.
- Prefix transformations must never mutate the shared event or payload.

## Review Focus

- Array messages whose first meaningful content includes non-text segments before text: prefix gating must not strip or reorder unrelated segments.
- Prefix-only messages such as `/airi`: selected client should receive an empty textual body consistently in raw/string/array representations.
- Multiple clients with `/a` and `/airi`: each evaluates the untouched original event independently.
- Scoped keyword filters with malformed/missing `group_id`: fail open consistently with existing ID-filter behavior.
- Hot config replacement: filter/prefix changes must take effect without unnecessarily reconnecting the WS transport.

---

### Task 1: Establish the upstream-dev implementation baseline

**Files:**
- Repository history/branch operation; no feature file changes required by this task.

**Interfaces:**
- Consumes: upstream `dev` head and fork feature branch.
- Produces: a feature branch containing upstream `dev` plus the existing private customizations and ARM64 packaging.

- [ ] **Step 1: Snapshot the current fork branch head and compare it with upstream `dev`.**

Run comparison and record files that conflict with existing customization, especially `packages/onebot/src/config.ts`, `types.ts`, `event-filter.ts`, `network/ws-client-adapter.ts`, WebUI types/editor, and packaging files.

- [ ] **Step 2: Integrate upstream `dev` without discarding private customization.**

Use a merge/rebase strategy that preserves upstream changes and explicitly resolves customized OneBot/WebUI files.

- [ ] **Step 3: Verify existing custom tests still pass before adding new behavior.**

Run the existing WS-client filter tests and `pnpm typecheck`. Expected: PASS, or document/fix migration regressions before Task 2.

- [ ] **Step 4: Commit the baseline migration.**

Commit message: `chore: sync private filters with upstream dev`

### Task 2: Extend configuration types and persistence

**Files:**
- Modify: `packages/onebot/src/types.ts`
- Modify: `packages/onebot/src/config.ts`
- Modify/add tests under: `packages/onebot/tests/`
- Modify WebUI shared OneBot types where upstream keeps API types (inspect current tree after Task 1).

**Interfaces:**
- Produces: `KeywordFilterConfig.groupIds?: number[]`; `MessagePrefixConfig { prefix: string; groupIds: number[] }`; `WsClientNetwork.messagePrefix?: MessagePrefixConfig`.

- [ ] **Step 1: Write failing config tests.**

Cover keyword group scope round-trip, prefix round-trip, deduped positive group IDs, rejection of blank/multiline prefix, rejection of enabled prefix with empty group list, and strict-restore acceptance/rejection of new keys.

- [ ] **Step 2: Run targeted config tests and verify failure.**

Expected: FAIL because new fields are absent/unknown.

- [ ] **Step 3: Add the exact interfaces and parser/serializer/validator support.**

Keep absent keyword `groupIds` backward-compatible. Normalize optional empty keyword scope to absent/empty legacy semantics. Prefix config is omitted when disabled.

- [ ] **Step 4: Run targeted config tests.**

Expected: PASS.

- [ ] **Step 5: Commit.**

Commit message: `feat(onebot): configure scoped keywords and node prefixes`

### Task 3: Implement immutable scoped filtering and prefix transformation

**Files:**
- Modify: `packages/onebot/src/event-filter.ts`
- Modify/add: `packages/onebot/tests/ws-client-message-filters.test.ts`
- Add focused prefix-transform tests if clearer than expanding the existing test file.

**Interfaces:**
- Consumes: Task 2 config types.
- Produces: scoped `passesKeywordFilter(...)` behavior and a pure helper such as `applyMessagePrefix(event, config): JsonObject | null` returning the original/clone/null according to routing semantics.

- [ ] **Step 1: Write failing scoped-keyword tests.**

Assert selected groups apply keyword mode, unselected groups bypass, private messages still apply keyword filtering, and absent/empty scope preserves legacy behavior.

- [ ] **Step 2: Write failing prefix tests.**

Assert selected group requires prefix; matching prefix is stripped; unselected group/private message bypass; original event is unchanged; exact case-sensitive matching; prefix-only body; array/string/raw consistency; non-text segments remain ordered.

- [ ] **Step 3: Run targeted tests and verify failure.**

Expected: FAIL on missing scope/prefix behavior.

- [ ] **Step 4: Implement minimal pure helpers.**

Prefix stripping removes one leading configured prefix plus whitespace immediately after it. Never mutate the input object or segment array.

- [ ] **Step 5: Run targeted tests.**

Expected: PASS.

- [ ] **Step 6: Commit.**

Commit message: `feat(onebot): add scoped keyword and prefix routing logic`

### Task 4: Wire per-client transformed events into WS dispatch

**Files:**
- Modify: `packages/onebot/src/network/ws-client-adapter.ts`
- Modify/add: `packages/onebot/tests/ws-client-group-message-filter-adapter.test.ts` or a dedicated adapter test.

**Interfaces:**
- Consumes: Task 3 filter/transform helpers.
- Produces: per-client dispatch order: group → private → keyword → prefix transform → format/self-message shaping → send.

- [ ] **Step 1: Write failing adapter tests for two clients with different prefixes.**

Use one original event and assert each socket receives its own stripped copy while the original and other client's result remain independent.

- [ ] **Step 2: Add tests for hot config replacement.**

Changing keyword scope/prefix should affect subsequent events without forcing a transport binding signature change.

- [ ] **Step 3: Run adapter tests and verify failure.**

Expected: FAIL before adapter wiring.

- [ ] **Step 4: Update `onEvent` to filter and transform per client.**

When prefix transformation returns null, drop only this client. When it returns a transformed event, serialize from that event rather than the shared prebuilt payload.

- [ ] **Step 5: Run adapter tests.**

Expected: PASS.

- [ ] **Step 6: Commit.**

Commit message: `feat(onebot): route prefixed messages per ws client`

### Task 5: Add WebUI controls

**Files:**
- Modify: `packages/webui/src/components/config/node-edit-dialog.tsx`
- Reuse/modify: `packages/webui/src/components/config/group-message-filter-utils.ts`
- Modify/add WebUI tests for group parsing and node editor helpers/types.

**Interfaces:**
- Consumes: Task 2 WebUI-visible config types.
- Produces: WS-client-only controls for keyword group scope and prefix/group scope.

- [ ] **Step 1: Write/extend failing utility tests.**

Assert comma/whitespace-separated IDs, dedupe, invalid IDs, formatting, and round-trip for both keyword scope and prefix group lists.

- [ ] **Step 2: Run WebUI targeted tests and verify failure where new helpers/state are absent.**

- [ ] **Step 3: Extend the WS-client editor.**

Add keyword scope toggle/input and prefix enable/input/group input. Reuse existing parsing/validation UI patterns and explain that the prefix is stripped before forwarding.

- [ ] **Step 4: Ensure saving disabled/blank prefix removes `messagePrefix` rather than persisting an invalid object.**

- [ ] **Step 5: Run WebUI targeted tests and typecheck.**

Expected: PASS.

- [ ] **Step 6: Commit.**

Commit message: `feat(webui): configure scoped keywords and node prefixes`

### Task 6: Regression and release-build verification

**Files:**
- Modify only if verification exposes regressions.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: verified private branch ready for local Windows/Raspberry Pi packaging.

- [ ] **Step 1: Run all custom OneBot filter tests.**

Expected: PASS.

- [ ] **Step 2: Run workspace typecheck.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Run normal project build.**

Run: `pnpm run build:all`
Expected: PASS (chunk-size warnings allowed).

- [ ] **Step 4: Run ARM64 packaging-script unit tests.**

Run the existing `tools/package-linux-arm64.test.mjs` suite. Expected: PASS.

- [ ] **Step 5: Inspect branch diff for accidental upstream/public-release changes.**

Confirm no PR/release workflow or secrets were introduced and ARM64 packaging remains intact.

- [ ] **Step 6: Commit any verification-only fixes separately.**

Commit message if needed: `fix: resolve scoped routing regressions`
