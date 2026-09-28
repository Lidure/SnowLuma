import { useState } from 'react';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import type { WsClientNetwork } from '@/types';
import {
  formatGroupIdsInput,
  formatKeywordPatternsInput,
  formatUserIdsInput,
  parseGroupIdsInput,
  parseKeywordPatternsInput,
  parseUserIdsInput,
  type GroupMessageFilterConfig,
  type KeywordFilterConfig,
  type MessagePrefixConfig,
  type PrivateMessageFilterConfig,
} from './group-message-filter-utils';

export type RoutingWsClientNetwork = WsClientNetwork & {
  groupMessageFilter?: GroupMessageFilterConfig;
  privateMessageFilter?: PrivateMessageFilterConfig;
  keywordFilter?: KeywordFilterConfig;
  messagePrefix?: MessagePrefixConfig;
};

interface Props {
  value: RoutingWsClientNetwork;
  onChange: (changes: Partial<RoutingWsClientNetwork>) => void;
}

const MODE_OPTIONS = [
  { value: 'blacklist', label: '黑名单' },
  { value: 'whitelist', label: '白名单' },
] as const;

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function ErrorText({ text }: { text?: string }) {
  return text ? <p className="mt-1 text-xs text-destructive">{text}</p> : null;
}

export function WsClientRoutingFields({ value, onChange }: Props) {
  const [groupIdsText, setGroupIdsText] = useState(formatGroupIdsInput(value.groupMessageFilter?.groupIds));
  const [privateIdsText, setPrivateIdsText] = useState(formatUserIdsInput(value.privateMessageFilter?.userIds));
  const [keywordText, setKeywordText] = useState(formatKeywordPatternsInput(value.keywordFilter?.patterns));
  const [keywordGroupText, setKeywordGroupText] = useState(formatGroupIdsInput(value.keywordFilter?.groupIds));
  const [prefixGroupText, setPrefixGroupText] = useState(formatGroupIdsInput(value.messagePrefix?.groupIds));
  const [groupError, setGroupError] = useState<string>();
  const [privateError, setPrivateError] = useState<string>();
  const [keywordError, setKeywordError] = useState<string>();
  const [keywordGroupError, setKeywordGroupError] = useState<string>();
  const [prefixGroupError, setPrefixGroupError] = useState<string>();

  const groupEnabled = !!value.groupMessageFilter;
  const privateEnabled = !!value.privateMessageFilter;
  const keywordEnabled = !!value.keywordFilter;
  const keywordScoped = !!value.keywordFilter?.groupIds?.length;
  const prefixEnabled = !!value.messagePrefix;

  return (
    <section className="flex flex-col gap-1.5">
      <span className="px-1 text-xs font-medium text-muted-foreground">消息路由与过滤</span>
      <div className="flex flex-col gap-3">
        <Card title="群聊过滤" desc="按群号决定该节点接收或屏蔽哪些群聊消息。">
          <div className="flex items-center justify-between gap-4">
            <Label>启用</Label>
            <ToggleSwitch
              value={groupEnabled}
              onChange={(enabled) => onChange({
                groupMessageFilter: enabled ? { mode: 'blacklist', groupIds: [] } : undefined,
              })}
              ariaLabel="启用群聊过滤"
            />
          </div>
          {groupEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
            <DropdownSelect
              ariaLabel="群聊过滤模式"
              value={value.groupMessageFilter!.mode}
              options={[...MODE_OPTIONS]}
              onChange={(mode) => onChange({ groupMessageFilter: { ...value.groupMessageFilter!, mode } })}
            />
            <div>
              <Input
                value={groupIdsText}
                placeholder="群号，逗号或空格分隔"
                onChange={(event) => {
                  const text = event.target.value;
                  setGroupIdsText(text);
                  const parsed = parseGroupIdsInput(text);
                  setGroupError(parsed.error);
                  if (!parsed.error) onChange({ groupMessageFilter: { ...value.groupMessageFilter!, groupIds: parsed.groupIds } });
                }}
              />
              <ErrorText text={groupError} />
            </div>
          </div>}
        </Card>

        <Card title="私聊过滤" desc="按 QQ 号决定该节点接收或屏蔽哪些私聊消息。">
          <div className="flex items-center justify-between gap-4">
            <Label>启用</Label>
            <ToggleSwitch
              value={privateEnabled}
              onChange={(enabled) => onChange({
                privateMessageFilter: enabled ? { mode: 'blacklist', userIds: [] } : undefined,
              })}
              ariaLabel="启用私聊过滤"
            />
          </div>
          {privateEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
            <DropdownSelect
              ariaLabel="私聊过滤模式"
              value={value.privateMessageFilter!.mode}
              options={[...MODE_OPTIONS]}
              onChange={(mode) => onChange({ privateMessageFilter: { ...value.privateMessageFilter!, mode } })}
            />
            <div>
              <Input
                value={privateIdsText}
                placeholder="QQ号，逗号或空格分隔"
                onChange={(event) => {
                  const text = event.target.value;
                  setPrivateIdsText(text);
                  const parsed = parseUserIdsInput(text);
                  setPrivateError(parsed.error);
                  if (!parsed.error) onChange({ privateMessageFilter: { ...value.privateMessageFilter!, userIds: parsed.userIds } });
                }}
              />
              <ErrorText text={privateError} />
            </div>
          </div>}
        </Card>

        <Card title="关键词过滤" desc="关键词规则可以应用到所有群聊，也可以只应用到指定群聊；私聊仍按关键词规则处理。">
          <div className="flex items-center justify-between gap-4">
            <Label>启用</Label>
            <ToggleSwitch
              value={keywordEnabled}
              onChange={(enabled) => onChange({
                keywordFilter: enabled ? { mode: 'blacklist', patterns: [], regex: false } : undefined,
              })}
              ariaLabel="启用关键词过滤"
            />
          </div>
          {keywordEnabled && <div className="mt-3 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <DropdownSelect
                ariaLabel="关键词过滤模式"
                value={value.keywordFilter!.mode}
                options={[...MODE_OPTIONS]}
                onChange={(mode) => onChange({ keywordFilter: { ...value.keywordFilter!, mode } })}
              />
              <label className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                <span>正则表达式</span>
                <ToggleSwitch
                  value={value.keywordFilter!.regex === true}
                  onChange={(regex) => {
                    const parsed = parseKeywordPatternsInput(keywordText, regex);
                    setKeywordError(parsed.error);
                    if (!parsed.error) onChange({ keywordFilter: { ...value.keywordFilter!, regex, patterns: parsed.patterns } });
                  }}
                  ariaLabel="使用正则表达式"
                />
              </label>
            </div>
            <div>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={keywordText}
                placeholder={'每行一个关键词\n例如：广告\nspam'}
                onChange={(event) => {
                  const text = event.target.value;
                  setKeywordText(text);
                  const parsed = parseKeywordPatternsInput(text, value.keywordFilter!.regex === true);
                  setKeywordError(parsed.error);
                  if (!parsed.error) onChange({ keywordFilter: { ...value.keywordFilter!, patterns: parsed.patterns } });
                }}
              />
              <ErrorText text={keywordError} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>仅应用于指定群聊</Label>
                <p className="text-xs text-muted-foreground">关闭时保持旧行为：所有群聊都应用关键词规则。</p>
              </div>
              <ToggleSwitch
                value={keywordScoped}
                onChange={(enabled) => onChange({
                  keywordFilter: { ...value.keywordFilter!, groupIds: enabled ? [] : undefined },
                })}
                ariaLabel="关键词仅应用于指定群聊"
              />
            </div>
            {keywordScoped && <div>
              <Input
                value={keywordGroupText}
                placeholder="应用关键词规则的群号"
                onChange={(event) => {
                  const text = event.target.value;
                  setKeywordGroupText(text);
                  const parsed = parseGroupIdsInput(text);
                  setKeywordGroupError(parsed.error);
                  if (!parsed.error) onChange({ keywordFilter: { ...value.keywordFilter!, groupIds: parsed.groupIds } });
                }}
              />
              <ErrorText text={keywordGroupError} />
            </div>}
          </div>}
        </Card>

        <Card title="节点消息前缀" desc="指定群聊只有以此前缀开头的消息才进入该节点；转发前会自动移除前缀。私聊和未指定群聊不受影响。">
          <div className="flex items-center justify-between gap-4">
            <Label>启用</Label>
            <ToggleSwitch
              value={prefixEnabled}
              onChange={(enabled) => onChange({
                messagePrefix: enabled ? { prefix: '/', groupIds: [] } : undefined,
              })}
              ariaLabel="启用节点消息前缀"
            />
          </div>
          {prefixEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <Label>前缀</Label>
              <Input
                className="mt-1.5"
                value={value.messagePrefix!.prefix}
                placeholder="例如 /airi"
                onChange={(event) => onChange({ messagePrefix: { ...value.messagePrefix!, prefix: event.target.value } })}
              />
            </div>
            <div>
              <Label>应用群聊</Label>
              <Input
                className="mt-1.5"
                value={prefixGroupText}
                placeholder="至少填写一个群号"
                onChange={(event) => {
                  const text = event.target.value;
                  setPrefixGroupText(text);
                  const parsed = parseGroupIdsInput(text);
                  setPrefixGroupError(parsed.error);
                  if (!parsed.error) onChange({ messagePrefix: { ...value.messagePrefix!, groupIds: parsed.groupIds } });
                }}
              />
              <ErrorText text={prefixGroupError} />
            </div>
          </div>}
        </Card>
      </div>
    </section>
  );
}
