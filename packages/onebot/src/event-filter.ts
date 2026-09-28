import type {
  GroupMessageFilterConfig,
  JsonObject,
  JsonValue,
  KeywordFilterConfig,
  MessageFormat,
  MessagePrefixConfig,
  PrivateMessageFilterConfig,
} from './types';

export interface EventReportOptions {
  messageFormat: MessageFormat;
  reportSelfMessage: boolean;
}

export function resolveReportOptions(
  network: { messageFormat?: MessageFormat; reportSelfMessage?: boolean },
): EventReportOptions {
  return {
    messageFormat: network.messageFormat ?? 'array',
    reportSelfMessage: network.reportSelfMessage ?? false,
  };
}

export interface DispatchPayload {
  isSelfMessage: boolean;
  arrayJson: string;
  stringJson: string;
}

export function buildDispatchPayload(event: JsonObject): DispatchPayload {
  const isSelfMessage = event.post_type === 'message_sent';
  const arrayJson = JSON.stringify(event);

  let stringJson = arrayJson;
  const hasMessage = event.post_type === 'message' || event.post_type === 'message_sent';
  if (hasMessage && Array.isArray(event.message)) {
    const raw = typeof event.raw_message === 'string' ? event.raw_message : '';
    stringJson = JSON.stringify({ ...event, message: raw as JsonValue });
  }

  return { isSelfMessage, arrayJson, stringJson };
}

export function shouldDispatchGroupMessage(
  event: JsonObject,
  filter: GroupMessageFilterConfig | undefined,
): boolean {
  if (!filter) return true;
  if (event.post_type !== 'message' && event.post_type !== 'message_sent') return true;
  if (event.message_type !== 'group') return true;

  const groupId = event.group_id;
  if (typeof groupId !== 'number' || !Number.isSafeInteger(groupId) || groupId <= 0) {
    return true;
  }

  const listed = filter.groupIds.includes(groupId);
  return filter.mode === 'blacklist' ? !listed : listed;
}

export function shouldDispatchPrivateMessage(
  event: JsonObject,
  filter: PrivateMessageFilterConfig | undefined,
): boolean {
  if (!filter) return true;
  if (event.post_type !== 'message' && event.post_type !== 'message_sent') return true;
  if (event.message_type !== 'private') return true;

  const userId = event.user_id;
  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0) {
    return true;
  }

  const listed = filter.userIds.includes(userId);
  return filter.mode === 'blacklist' ? !listed : listed;
}

/**
 * Best-effort plain-text view of a message event: prefer `raw_message`, fall
 * back to concatenated text segments, then to a string `message` (CQ code).
 * Only used for keyword matching — the event itself is never mutated.
 */
export function extractMessageText(event: JsonObject): string {
  if (typeof event.raw_message === 'string') return event.raw_message;
  if (typeof event.message === 'string') return event.message;
  if (Array.isArray(event.message)) {
    const parts: string[] = [];
    for (const segment of event.message) {
      if (typeof segment !== 'object' || segment === null || Array.isArray(segment)) continue;
      const seg = segment as JsonObject;
      if (seg.type !== 'text') continue;
      const data = seg.data;
      if (typeof data !== 'object' || data === null || Array.isArray(data)) continue;
      const text = (data as JsonObject).text;
      if (typeof text === 'string') parts.push(text);
    }
    return parts.join('');
  }
  return '';
}

function matchesPattern(text: string, pattern: string, regex: boolean): boolean {
  if (!regex) return text.includes(pattern);
  try {
    return new RegExp(pattern).test(text);
  } catch {
    // Config validation rejects bad regexes up front; stay fail-open here so a
    // hand-edited config never wedges event dispatch.
    return false;
  }
}

/**
 * Content filter applied to private and group chat message events.
 * A non-empty `groupIds` list scopes only the group side of the filter;
 * private-message behavior stays unchanged. Absent/empty scope keeps the
 * legacy all-groups behavior.
 */
export function passesKeywordFilter(
  event: JsonObject,
  filter: KeywordFilterConfig | undefined,
): boolean {
  if (!filter) return true;
  if (event.post_type !== 'message' && event.post_type !== 'message_sent') return true;
  if (event.message_type !== 'private' && event.message_type !== 'group') return true;

  if (event.message_type === 'group' && filter.groupIds && filter.groupIds.length > 0) {
    const groupId = event.group_id;
    if (typeof groupId !== 'number' || !Number.isSafeInteger(groupId) || groupId <= 0) {
      return true;
    }
    if (!filter.groupIds.includes(groupId)) return true;
  }

  const matched = filter.patterns.length > 0
    && filter.patterns.some((pattern) => matchesPattern(extractMessageText(event), pattern, filter.regex === true));
  return filter.mode === 'blacklist' ? !matched : matched;
}

function stripConfiguredPrefix(text: string, prefix: string): string | null {
  if (!text.startsWith(prefix)) return null;
  return text.slice(prefix.length).replace(/^\s+/, '');
}

function firstTextSegment(message: unknown): { index: number; segment: JsonObject; data: JsonObject; text: string } | null {
  if (!Array.isArray(message) || message.length === 0) return null;
  const first = message[0];
  if (typeof first !== 'object' || first === null || Array.isArray(first)) return null;
  const segment = first as JsonObject;
  if (segment.type !== 'text') return null;
  if (typeof segment.data !== 'object' || segment.data === null || Array.isArray(segment.data)) return null;
  const data = segment.data as JsonObject;
  if (typeof data.text !== 'string') return null;
  return { index: 0, segment, data, text: data.text };
}

/**
 * Apply a WS-client-specific group prefix gate without mutating the shared
 * OneBot event. `null` means the selected group message does not carry the
 * required prefix. Unselected groups, private messages and non-message events
 * return the original event object unchanged.
 */
export function applyMessagePrefix(
  event: JsonObject,
  config: MessagePrefixConfig | undefined,
): JsonObject | null {
  if (!config || !config.prefix) return event;
  if (event.post_type !== 'message' && event.post_type !== 'message_sent') return event;
  if (event.message_type !== 'group') return event;

  const groupId = event.group_id;
  if (typeof groupId !== 'number' || !Number.isSafeInteger(groupId) || groupId <= 0) return event;
  if (!config.groupIds.includes(groupId)) return event;

  let strippedRaw: string | undefined;
  if (typeof event.raw_message === 'string') {
    const stripped = stripConfiguredPrefix(event.raw_message, config.prefix);
    if (stripped === null) return null;
    strippedRaw = stripped;
  }

  let transformedMessage: JsonValue | undefined;
  if (typeof event.message === 'string') {
    const stripped = stripConfiguredPrefix(event.message, config.prefix);
    if (stripped === null) return null;
    transformedMessage = stripped;
  } else if (Array.isArray(event.message)) {
    const firstText = firstTextSegment(event.message);
    if (!firstText) return null;
    const stripped = stripConfiguredPrefix(firstText.text, config.prefix);
    if (stripped === null) return null;
    const cloned = [...event.message] as JsonValue[];
    cloned[firstText.index] = {
      ...firstText.segment,
      data: {
        ...firstText.data,
        text: stripped,
      },
    } as JsonValue;
    transformedMessage = cloned;
  } else if (strippedRaw === undefined) {
    // Nothing in the event proves the configured prefix was present.
    return null;
  }

  const transformed: JsonObject = { ...event };
  if (strippedRaw !== undefined) transformed.raw_message = strippedRaw;
  if (transformedMessage !== undefined) transformed.message = transformedMessage;
  return transformed;
}

export function pickDispatchJson(
  payload: DispatchPayload,
  options: EventReportOptions,
): string | null {
  if (payload.isSelfMessage && !options.reportSelfMessage) return null;
  return options.messageFormat === 'string' ? payload.stringJson : payload.arrayJson;
}

export function shapeEventForAdapter(
  event: JsonObject,
  options: EventReportOptions,
): JsonObject | null {
  if (event.post_type === 'message_sent' && !options.reportSelfMessage) return null;

  if (options.messageFormat === 'string'
    && (event.post_type === 'message' || event.post_type === 'message_sent')
    && Array.isArray(event.message)
  ) {
    const raw = typeof event.raw_message === 'string' ? event.raw_message : '';
    return { ...event, message: raw as JsonValue };
  }

  return event;
}
