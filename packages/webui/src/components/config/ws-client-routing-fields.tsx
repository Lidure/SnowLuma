import { useState, type ReactNode } from 'react';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiPicker } from '@/components/ui/multi-picker';
import { MultiTagInput } from '@/components/ui/multi-tag-input';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useAppState } from '@/contexts/AppStateContext';
import { useFriends, useGroups } from '@/hooks/use-debug-contacts';
import type { WsClientNetwork } from '@/types';
import {
  parseKeywordPatternsInput,
  resolveSelectedOptions,
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

function Card({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
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

function idsToStrings(ids: number[] | undefined): string[] {
  return (ids ?? []).map(String);
}

function stringsToIds(values: string[]): number[] {
  return values.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0);
}

function isPositiveSafeInteger(raw: string): boolean {
  if (!/^\d+$/.test(raw)) return false;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0;
}

export function WsClientRoutingFields({ value, onChange }: Props) {
  const { selectedUin } = useAppState();
  const groups = useGroups(selectedUin ?? '');
  const friends = useFriends(selectedUin ?? '');
  const [keywordScopeEnabled, setKeywordScopeEnabled] = useState(value.keywordFilter?.groupIds !== undefined);
  const [keywordError, setKeywordError] = useState<string>();

  const groupEnabled = !!value.groupMessageFilter;
  const privateEnabled = !!value.privateMessageFilter;
  const keywordEnabled = !!value.keywordFilter;
  const prefixEnabled = !!value.messagePrefix;
  const keywordGroupsMissing = keywordEnabled && keywordScopeEnabled && (value.keywordFilter?.groupIds?.length ?? 0) === 0;
  const prefixGroupsMissing = prefixEnabled && (value.messagePrefix?.groupIds.length ?? 0) === 0;
  const prefixMissing = prefixEnabled && !value.messagePrefix?.prefix.trim();

  const groupFilterValues = idsToStrings(value.groupMessageFilter?.groupIds);
  const privateFilterValues = idsToStrings(value.privateMessageFilter?.userIds);
  const keywordGroupValues = idsToStrings(value.keywordFilter?.groupIds);
  const prefixGroupValues = idsToStrings(value.messagePrefix?.groupIds);

  const selectedGroupFilters = resolveSelectedOptions(groupFilterValues, groups.items, '未知群聊');
  const selectedPrivateFilters = resolveSelectedOptions(privateFilterValues, friends.items, '未知好友');
  const selectedKeywordGroups = resolveSelectedOptions(keywordGroupValues, groups.items, '未知群聊');
  const selectedPrefixGroups = resolveSelectedOptions(prefixGroupValues, groups.items, '未知群聊');

  const groupPickerCommon = {
    options: groups.items,
    loading: groups.loading,
    error: groups.error,
    onRefresh: groups.refresh,
    validateRaw: isPositiveSafeInteger,
  };

  const friendPickerCommon = {
    options: friends.items,
    loading: friends.loading,
    error: friends.error,
    onRefresh: friends.refresh,
    validateRaw: isPositiveSafeInteger,
  };

  return (
    <section className="flex flex-col gap-1.5">
      <span className="px-1 text-xs font-medium text-muted-foreground">消息路由与过滤</span>
      <div className="flex flex-col gap-3">
        <Card title="群聊过滤" desc="直接从 Bot 已加入的群聊中选择；列表暂不可用时也可手动输入群号。">
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
            <MultiPicker
              {...groupPickerCommon}
              values={groupFilterValues}
              selectedOptions={selectedGroupFilters}
              onChange={(values) => onChange({
                groupMessageFilter: { ...value.groupMessageFilter!, groupIds: stringsToIds(values) },
              })}
              placeholder="搜索群名称 / 群号并添加…"
              ariaLabel="选择群聊过滤群号"
              emptyLabel="尚未选择群聊"
            />
          </div>}
        </Card>

        <Card title="私聊过滤" desc="直接从 Bot 好友列表中选择 QQ；列表暂不可用时也可手动输入 QQ 号。">
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
            <MultiPicker
              {...friendPickerCommon}
              values={privateFilterValues}
              selectedOptions={selectedPrivateFilters}
              onChange={(values) => onChange({
                privateMessageFilter: { ...value.privateMessageFilter!, userIds: stringsToIds(values) },
              })}
              placeholder="搜索好友昵称 / QQ号并添加…"
              ariaLabel="选择私聊过滤QQ号"
              emptyLabel="尚未选择好友"
            />
          </div>}
        </Card>

        <Card title="关键词过滤" desc="关键词用标签管理；规则可以应用到所有群聊，也可以只应用到从群列表中选择的群聊。私聊仍按关键词规则处理。">
          <div className="flex items-center justify-between gap-4">
            <Label>启用</Label>
            <ToggleSwitch
              value={keywordEnabled}
              onChange={(enabled) => {
                if (!enabled) setKeywordScopeEnabled(false);
                setKeywordError(undefined);
                onChange({ keywordFilter: enabled ? { mode: 'blacklist', patterns: [], regex: false } : undefined });
              }}
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
                    const parsed = parseKeywordPatternsInput(value.keywordFilter!.patterns.join('\n'), regex);
                    setKeywordError(parsed.error);
                    if (!parsed.error) onChange({ keywordFilter: { ...value.keywordFilter!, regex, patterns: parsed.patterns } });
                  }}
                  ariaLabel="使用正则表达式"
                />
              </label>
            </div>
            <div>
              <MultiTagInput
                values={value.keywordFilter!.patterns}
                onChange={(patterns) => {
                  setKeywordError(undefined);
                  onChange({ keywordFilter: { ...value.keywordFilter!, patterns } });
                }}
                placeholder="输入关键词后按 Enter 添加"
                ariaLabel="添加关键词"
                validateItem={(pattern) => {
                  if (value.keywordFilter!.regex !== true) return undefined;
                  try {
                    new RegExp(pattern);
                    return undefined;
                  } catch {
                    return `正则“${pattern}”无法编译`;
                  }
                }}
                helperText="按 Enter 添加；粘贴多行可批量添加。逗号和空格会保留在关键词中。"
              />
              <ErrorText text={keywordError} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>仅应用于指定群聊</Label>
                <p className="text-xs text-muted-foreground">关闭时保持旧行为：所有群聊都应用关键词规则。</p>
              </div>
              <ToggleSwitch
                value={keywordScopeEnabled}
                onChange={(enabled) => {
                  setKeywordScopeEnabled(enabled);
                  onChange({ keywordFilter: { ...value.keywordFilter!, groupIds: enabled ? [] : undefined } });
                }}
                ariaLabel="关键词仅应用于指定群聊"
              />
            </div>
            {keywordScopeEnabled && <div>
              <MultiPicker
                {...groupPickerCommon}
                values={keywordGroupValues}
                selectedOptions={selectedKeywordGroups}
                onChange={(values) => onChange({
                  keywordFilter: { ...value.keywordFilter!, groupIds: stringsToIds(values) },
                })}
                placeholder="搜索要应用关键词规则的群聊…"
                ariaLabel="选择关键词适用群聊"
                emptyLabel="尚未选择适用群聊"
              />
              <ErrorText text={keywordGroupsMissing ? '启用指定群聊后至少选择一个群聊' : undefined} />
            </div>}
          </div>}
        </Card>

        <Card title="节点消息前缀" desc="指定群聊只有以此前缀开头的消息才进入该节点；转发前会自动移除前缀。私聊和未指定群聊不受影响。">
          <div className="flex items-center justify-between gap-4">
            <Label>启用</Label>
            <ToggleSwitch
              value={prefixEnabled}
              onChange={(enabled) => onChange({ messagePrefix: enabled ? { prefix: '/airi', groupIds: [] } : undefined })}
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
              <ErrorText text={prefixMissing ? '前缀不能为空' : undefined} />
            </div>
            <div>
              <Label>应用群聊</Label>
              <MultiPicker
                {...groupPickerCommon}
                className="mt-1.5"
                values={prefixGroupValues}
                selectedOptions={selectedPrefixGroups}
                onChange={(values) => onChange({
                  messagePrefix: { ...value.messagePrefix!, groupIds: stringsToIds(values) },
                })}
                placeholder="搜索需要前缀的群聊…"
                ariaLabel="选择前缀适用群聊"
                emptyLabel="尚未选择适用群聊"
              />
              <ErrorText text={prefixGroupsMissing ? '启用前缀后至少选择一个群聊' : undefined} />
            </div>
          </div>}
        </Card>
      </div>
    </section>
  );
}
