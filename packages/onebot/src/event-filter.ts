import type {
  GroupMessageFilterConfig,
  JsonObject,
  JsonValue,
  KeywordFilterConfig,
  MessageFormat,
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
 * Content filter applied to both private and group chat message events.
 * blacklist: matched messages are dropped; whitelist: only matched messages
 * pass. An empty pattern list matches nothing — so an empty blacklist passes
 * everything and an empty whitelist blocks everything, mirroring the
 * group/private id filters.
 */
export function passesKeywordFilter(
  event: JsonObject,
  filter: KeywordFilterConfig | undefined,
): boolean {
  if (!filter) return true;
  if (event.post_type !== 'message' && event.post_type !== 'message_sent') return true;
  if (event.message_type !== 'private' && event.message_type !== 'group') return true;

  const matched = filter.patterns.length > 0
    && filter.patterns.some((pattern) => matchesPattern(extractMessageText(event), pattern, filter.regex === true));
  return filter.mode === 'blacklist' ? !matched : matched;
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
