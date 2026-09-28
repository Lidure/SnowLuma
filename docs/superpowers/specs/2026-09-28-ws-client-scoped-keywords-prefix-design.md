# WS Client Scoped Keyword and Prefix Routing Design

## Goal

Extend the private SnowLuma WS-client routing customizations on top of the current upstream `dev` baseline so each outbound WS client can:

1. retain its existing independent group/private message filters;
2. apply keyword filtering only to selected group chats when desired; and
3. require a client-specific prefix in selected group chats, stripping that prefix only from the event copy sent to that WS client.

The implementation remains private/self-hosted. Do not create an upstream PR or public release without explicit user approval.

## Upstream baseline

Rebase/migrate the customization onto the current `SnowLuma/SnowLuma` `dev` branch before implementing the new behavior. At design time the inspected upstream `dev` head is `93b5c1b4bf148cf14025b4b7f3970db70d818890`.

Preserve the Raspberry Pi ARM64 self-hosted packaging support already present in the fork.

## Existing behavior to preserve

Each WS client may independently configure:

- group message blacklist/whitelist;
- private sender blacklist/whitelist;
- keyword blacklist/whitelist, including optional regex matching.

Adapters without these custom fields must behave exactly like upstream SnowLuma.

## Scoped keyword filtering

Extend `KeywordFilterConfig` with an optional group scope.

Proposed representation:

```ts
interface KeywordFilterConfig {
  mode: 'blacklist' | 'whitelist';
  patterns: string[];
  regex?: boolean;
  groupIds?: number[];
}
```

Semantics:

- `groupIds` absent or empty: preserve legacy behavior; keyword filtering applies to all private and group message events.
- non-empty `groupIds`: for group messages, apply the keyword rule only when `group_id` is listed; group messages from other groups bypass this keyword filter.
- private messages continue to use the configured keyword filter. Group scoping does not silently disable private keyword filtering.
- non-message events bypass keyword filtering as today.

This preserves existing saved configurations while adding an opt-in group scope.

## Per-client prefix routing

Add an optional WS-client prefix routing configuration:

```ts
interface MessagePrefixConfig {
  prefix: string;
  groupIds: number[];
}
```

Semantics:

- no configuration or blank prefix: feature disabled.
- `groupIds` contains the current group: the message must start with the configured prefix to be dispatched to this WS client.
- selected group + missing prefix: drop the event for this WS client only.
- selected group + matching prefix: dispatch a client-specific cloned event with the prefix removed.
- groups not listed: dispatch normally without requiring/removing a prefix.
- private messages: unaffected.
- prefix matching is exact and case-sensitive.
- remove exactly one leading prefix occurrence; after removal, trim only whitespace immediately following the prefix so `/airi hello` becomes `hello`.

`groupIds` must be non-empty for an enabled prefix rule. This avoids an ambiguous interpretation where an empty list could accidentally gate every group.

## Message transformation

Prefix stripping must never mutate the shared original event or shared `DispatchPayload`, because different WS clients may use different prefixes or no prefix at all.

For a matching WS client, clone and transform the event before serialization. Keep these representations consistent:

- `raw_message`;
- string-format `message`;
- array-format `message` text segments.

Only the leading textual prefix is removed. Non-text OneBot segments are preserved. If an array message begins with a text segment containing the prefix, rewrite that first textual content and preserve all remaining segments. If the leading message content cannot prove the configured prefix is present, do not dispatch under a prefix-gated rule.

After transformation, build the JSON for that WS client from the transformed event so both `array` and `string` output formats observe the stripped text.

## Filter order

For each WS client event:

1. enabled/socket/role checks;
2. group blacklist/whitelist;
3. private sender blacklist/whitelist;
4. scoped keyword filter;
5. prefix gate and per-client event transformation;
6. report-self-message/message-format shaping;
7. send.

Keyword matching intentionally sees the original user message including the prefix. Prefix removal is a routing transformation immediately before client-specific serialization.

## Configuration validation and persistence

Update OneBot config parsing, strict restore validation, serialization, and normalization for the new fields.

Requirements:

- group IDs are positive safe integers and deduplicated;
- keyword `groupIds` is optional and backward-compatible;
- prefix is single-line, trimmed, and non-empty when enabled;
- prefix group list must contain at least one valid group ID;
- invalid regex behavior retains the existing validation contract;
- unknown/malformed fields must not bypass strict restore validation.

## WebUI

Only the WS Client editor receives these controls.

Keyword filter section:

- existing mode/pattern/regex controls;
- optional “仅应用于指定群聊” control;
- group-ID input when scoped mode is enabled.

Prefix section:

- enable/disable control;
- prefix text input;
- application group-ID input;
- explanatory copy that the prefix is removed before the event is sent to the remote node.

Reuse the existing group-ID parsing/formatting utilities rather than introducing a second parser.

## Tests

Add/extend tests for:

- legacy configurations with no scope/prefix;
- scoped keyword match in a selected group;
- scoped keyword bypass in an unselected group;
- private keyword behavior with a group scope present;
- prefix selected group with/without prefix;
- unselected group bypass;
- private message bypass;
- two WS clients using different prefixes for the same original event;
- original event remains unchanged;
- array and string message formats both receive stripped content;
- CQ/non-text segments are preserved;
- config normalization/serialization/strict restore validation;
- WebUI group-ID parsing and draft formatting.

Run targeted OneBot/WebUI tests, workspace typecheck, and the normal build before considering implementation complete.
