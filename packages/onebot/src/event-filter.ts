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

function isMessageEvent(event: JsonObject): boolean {
  return event.post_type === 'message' || event.post_type === 'message_sent';
}

export function shouldDispatchGroupMessage(
  event: JsonObject,
  filter: GroupMessageFilterConfig | undefined,
): boolean {
  if (!filter || !isMessageEvent(event) || event.message_type !== 'group') return true;

  const groupId = event.group_id;
  if (typeof groupId !== 'number' || !Number.isSafeInteger(groupId) || groupId <= 0) return true;

  const listed = filter.groupIds.includes(groupId);
  return filter.mode === 'blacklist' ? !listed : listed;
}

export function shouldDispatchPrivateMessage(
  event: JsonObject,
  filter: PrivateMessageFilterConfig | undefined,
): boolean {
  if (!filter || !isMessageEvent(event) || event.message_type !== 'private') return true;

  const userId = event.user_id;
  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0) return true;

  const listed = filter.userIds.includes(userId);
  return filter.mode === 'blacklist' ? !listed : listed;
}

/** Best-effort plain-text view used only for matching/routing decisions. */
export function extractMessageText(event: JsonObject): string {
  if (typeof event.raw_message === 'string') return event.raw_message;
  if (typeof event.message === 'string') return event.message;
  if (!Array.isArray(event.message)) return '';

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

function matchesPattern(text: string, pattern: string, regex: boolean): boolean {
  if (!regex) return text.includes(pattern);
  try {
    return new RegExp(pattern).test(text);
  } catch {
    return false;
  }
}

export function passesKeywordFilter(
  event: JsonObject,
  filter: KeywordFilterConfig | undefined,
): boolean {
  if (!filter || !isMessageEvent(event)) return true;
  if (event.message_type !== 'private' && event.message_type !== 'group') return true;

  if (event.message_type === 'group' && filter.groupIds && filter.groupIds.length > 0) {
    const groupId = event.group_id;
    if (typeof groupId !== 'number' || !Number.isSafeInteger(groupId) || groupId <= 0) return true;
    if (!filter.groupIds.includes(groupId)) return true;
  }

  const text = extractMessageText(event);
  const matched = filter.patterns.length > 0
    && filter.patterns.some((pattern) => matchesPattern(text, pattern, filter.regex === true));
  return filter.mode === 'blacklist' ? !matched : matched;
}

function stripConfiguredPrefix(text: string, prefix: string): string | null {
  if (!text.startsWith(prefix)) return null;
  return text.slice(prefix.length).replace(/^\s+/, '');
}

function stripPrefixFromArrayMessage(message: JsonValue[], prefix: string): JsonValue[] | null {
  let foundText = false;
  const cloned = message.map((segment) => {
    if (foundText || typeof segment !== 'object' || segment === null || Array.isArray(segment)) return segment;
    const source = segment as JsonObject;
    if (source.type !== 'text') return segment;
    const data = source.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return segment;
    const sourceData = data as JsonObject;
    if (typeof sourceData.text !== 'string') return segment;

    foundText = true;
    const stripped = stripConfiguredPrefix(sourceData.text, prefix);
    if (stripped === null) return segment;
    return { ...source, data: { ...sourceData, text: stripped } } as JsonValue;
  });

  if (!foundText) return null;
  const firstText = message.find((segment) => {
    if (typeof segment !== 'object' || segment === null || Array.isArray(segment)) return false;
    const source = segment as JsonObject;
    if (source.type !== 'text') return false;
    const data = source.data;
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      && typeof (data as JsonObject).text === 'string';
  }) as JsonObject | undefined;
  const originalText = firstText && typeof firstText.data === 'object' && firstText.data !== null && !Array.isArray(firstText.data)
    ? (firstText.data as JsonObject).text
    : undefined;
  return typeof originalText === 'string' && originalText.startsWith(prefix) ? cloned : null;
}

/**
 * Apply a WS-client-only group prefix gate. Unselected groups/private events
 * are returned by identity; selected messages without the prefix return null;
 * matching messages return an immutable event copy with the prefix removed.
 */
export function applyMessagePrefix(
  event: JsonObject,
  config: MessagePrefixConfig | undefined,
): JsonObject | null {
  if (!config || !config.prefix || config.groupIds.length === 0) return event;
  if (!isMessageEvent(event) || event.message_type !== 'group') return event;

  const groupId = event.group_id;
  if (typeof groupId !== 'number' || !Number.isSafeInteger(groupId) || groupId <= 0) return event;
  if (!config.groupIds.includes(groupId)) return event;

  const sourceText = extractMessageText(event);
  if (stripConfiguredPrefix(sourceText, config.prefix) === null) return null;

  const next: JsonObject = { ...event };

  if (typeof event.raw_message === 'string') {
    const stripped = stripConfiguredPrefix(event.raw_message, config.prefix);
    if (stripped === null) return null;
    next.raw_message = stripped;
  }

  if (typeof event.message === 'string') {
    const stripped = stripConfiguredPrefix(event.message, config.prefix);
    if (stripped === null) return null;
    next.message = stripped;
  } else if (Array.isArray(event.message)) {
    const stripped = stripPrefixFromArrayMessage(event.message as JsonValue[], config.prefix);
    if (stripped === null) return null;
    next.message = stripped;
  }

  return next;
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
    && isMessageEvent(event)
    && Array.isArray(event.message)
  ) {
    const raw = typeof event.raw_message === 'string' ? event.raw_message : '';
    return { ...event, message: raw as JsonValue };
  }

  return event;
}
