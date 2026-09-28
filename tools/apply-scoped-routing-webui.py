from pathlib import Path

path = Path('packages/webui/src/components/config/node-edit-dialog.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match, found {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)


replace_once(
"""import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';""",
"""import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleSwitch } from '@/components/ui/toggle-switch';""",
)

replace_once(
"""import { generateAccessToken, NETWORK_TABS } from './defaults';

type AnyAdapter<K extends NetworkKind> = OneBotNetworks[K][number];""",
"""import { generateAccessToken, NETWORK_TABS } from './defaults';
import {
  formatGroupIdsInput,
  formatKeywordPatternsInput,
  formatUserIdsInput,
  parseGroupIdsInput,
  parseKeywordPatternsInput,
  parseUserIdsInput,
  validatePrefixInput,
  type GroupMessageFilterConfig,
  type GroupMessageFilterMode,
  type KeywordFilterConfig,
  type MessagePrefixConfig,
  type PrivateMessageFilterConfig,
} from './group-message-filter-utils';

type AnyAdapter<K extends NetworkKind> = OneBotNetworks[K][number];
type WsClientWithFilters = WsClientNetwork & {
  groupMessageFilter?: GroupMessageFilterConfig;
  privateMessageFilter?: PrivateMessageFilterConfig;
  keywordFilter?: KeywordFilterConfig;
  messagePrefix?: MessagePrefixConfig;
};
type GroupFilterUiMode = 'off' | GroupMessageFilterMode;""",
)

replace_once(
"""  const [draft, setDraft] = useState<AnyAdapter<K>>(initial);

  const trimmedName = draft.name?.trim() ?? '';""",
"""  const [draft, setDraft] = useState<AnyAdapter<K>>(initial);
  const initialWsClient = kind === 'wsClients' ? initial as WsClientWithFilters : undefined;
  const [groupIdsText, setGroupIdsText] = useState(
    () => formatGroupIdsInput(initialWsClient?.groupMessageFilter?.groupIds ?? []),
  );
  const [userIdsText, setUserIdsText] = useState(
    () => formatUserIdsInput(initialWsClient?.privateMessageFilter?.userIds ?? []),
  );
  const [keywordsText, setKeywordsText] = useState(
    () => formatKeywordPatternsInput(initialWsClient?.keywordFilter?.patterns ?? []),
  );
  const [keywordScopeEnabled, setKeywordScopeEnabled] = useState(
    () => (initialWsClient?.keywordFilter?.groupIds?.length ?? 0) > 0,
  );
  const [keywordGroupIdsText, setKeywordGroupIdsText] = useState(
    () => formatGroupIdsInput(initialWsClient?.keywordFilter?.groupIds ?? []),
  );
  const [prefixEnabled, setPrefixEnabled] = useState(() => !!initialWsClient?.messagePrefix);
  const [prefixText, setPrefixText] = useState(() => initialWsClient?.messagePrefix?.prefix ?? '');
  const [prefixGroupIdsText, setPrefixGroupIdsText] = useState(
    () => formatGroupIdsInput(initialWsClient?.messagePrefix?.groupIds ?? []),
  );

  const parsedGroupIds = useMemo(() => parseGroupIdsInput(groupIdsText), [groupIdsText]);
  const parsedUserIds = useMemo(() => parseUserIdsInput(userIdsText), [userIdsText]);
  const parsedKeywordGroupIds = useMemo(
    () => parseGroupIdsInput(keywordGroupIdsText),
    [keywordGroupIdsText],
  );
  const parsedPrefixGroupIds = useMemo(
    () => parseGroupIdsInput(prefixGroupIdsText),
    [prefixGroupIdsText],
  );
  const wsDraft = kind === 'wsClients' ? draft as WsClientWithFilters : undefined;
  const keywordRegex = wsDraft?.keywordFilter?.regex === true;
  const parsedKeywords = useMemo(
    () => parseKeywordPatternsInput(keywordsText, keywordRegex),
    [keywordsText, keywordRegex],
  );
  const groupFilterMode: GroupFilterUiMode = wsDraft?.groupMessageFilter?.mode ?? 'off';
  const privateFilterMode: GroupFilterUiMode = wsDraft?.privateMessageFilter?.mode ?? 'off';
  const keywordFilterMode: GroupFilterUiMode = wsDraft?.keywordFilter?.mode ?? 'off';
  const groupFilterError = groupFilterMode === 'off' ? undefined : parsedGroupIds.error;
  const privateFilterError = privateFilterMode === 'off' ? undefined : parsedUserIds.error;
  const keywordFilterError = keywordFilterMode === 'off' ? undefined : parsedKeywords.error;
  const keywordScopeError = keywordFilterMode === 'off' || !keywordScopeEnabled
    ? undefined
    : parsedKeywordGroupIds.error ?? (parsedKeywordGroupIds.groupIds.length === 0 ? '请至少填写一个群号' : undefined);
  const prefixValueError = !prefixEnabled ? undefined : validatePrefixInput(prefixText);
  const prefixGroupError = !prefixEnabled
    ? undefined
    : parsedPrefixGroupIds.error ?? (parsedPrefixGroupIds.groupIds.length === 0 ? '请至少填写一个群号' : undefined);

  const trimmedName = draft.name?.trim() ?? '';""",
)

replace_once(
"""  const canSave = !blankName && !duplicateName && (tokenFeedback?.valid ?? true);""",
"""  const canSave = !blankName
    && !duplicateName
    && (tokenFeedback?.valid ?? true)
    && !groupFilterError
    && !privateFilterError
    && !keywordFilterError
    && !keywordScopeError
    && !prefixValueError
    && !prefixGroupError;""",
)

replace_once(
"""            onClick={() => {
              const cleaned = { ...draft, name: trimmedName } as AnyAdapter<K>;
              onSubmit(cleaned);
              onOpenChange(false);
            }}""",
"""            onClick={() => {
              const cleaned = { ...draft, name: trimmedName } as AnyAdapter<K>;
              if (kind === 'wsClients') {
                const ws = cleaned as WsClientWithFilters;
                if (ws.groupMessageFilter) {
                  ws.groupMessageFilter = {
                    mode: ws.groupMessageFilter.mode,
                    groupIds: parsedGroupIds.groupIds,
                  };
                }
                if (ws.privateMessageFilter) {
                  ws.privateMessageFilter = {
                    mode: ws.privateMessageFilter.mode,
                    userIds: parsedUserIds.userIds,
                  };
                }
                if (ws.keywordFilter) {
                  ws.keywordFilter = {
                    mode: ws.keywordFilter.mode,
                    patterns: parsedKeywords.patterns,
                    ...(ws.keywordFilter.regex ? { regex: true } : {}),
                    ...(keywordScopeEnabled ? { groupIds: parsedKeywordGroupIds.groupIds } : {}),
                  };
                }
                ws.messagePrefix = prefixEnabled
                  ? { prefix: prefixText, groupIds: parsedPrefixGroupIds.groupIds }
                  : undefined;
              }
              onSubmit(cleaned);
              onOpenChange(false);
            }}""",
)

old_report = """            <SettingRow label=\"上报自身消息\" desc=\"将机器人自己发送的消息也作为 message_sent 事件上报\">"""
filters_ui = """            {kind === 'wsClients' && (
              <>
                <SettingRow
                  label=\"群消息过滤\"
                  desc=\"只影响此 WS 客户端收到的群聊消息，不影响私聊、通知或 API 通信\"
                >
                  <DropdownSelect
                    className=\"w-32\"
                    ariaLabel=\"群消息过滤模式\"
                    value={groupFilterMode}
                    options={GROUP_FILTER_OPTIONS}
                    onChange={(next) => {
                      if (next === 'off') {
                        patch({ groupMessageFilter: undefined } as unknown as Partial<AnyAdapter<K>>);
                        return;
                      }
                      patch({
                        groupMessageFilter: {
                          mode: next,
                          groupIds: parsedGroupIds.error ? [] : parsedGroupIds.groupIds,
                        },
                      } as unknown as Partial<AnyAdapter<K>>);
                    }}
                  />
                </SettingRow>

                {groupFilterMode !== 'off' && (
                  <div className=\"px-4 py-3\">
                    <Field
                      label=\"群号\"
                      placeholder=\"985983966, 787682322\"
                      value={groupIdsText}
                      onChange={setGroupIdsText}
                      error={groupFilterError}
                    />
                    <p className=\"mt-1.5 text-xs leading-relaxed text-muted-foreground\">
                      {groupFilterMode === 'blacklist'
                        ? '这些群的聊天消息不会发送到此 WS 客户端'
                        : '只有这些群的聊天消息会发送到此 WS 客户端'}
                    </p>
                  </div>
                )}

                <SettingRow
                  label=\"私聊消息过滤\"
                  desc=\"只影响此 WS 客户端收到的私聊消息\"
                >
                  <DropdownSelect
                    className=\"w-32\"
                    ariaLabel=\"私聊消息过滤模式\"
                    value={privateFilterMode}
                    options={GROUP_FILTER_OPTIONS}
                    onChange={(next) => {
                      if (next === 'off') {
                        patch({ privateMessageFilter: undefined } as unknown as Partial<AnyAdapter<K>>);
                        return;
                      }
                      patch({
                        privateMessageFilter: {
                          mode: next,
                          userIds: parsedUserIds.error ? [] : parsedUserIds.userIds,
                        },
                      } as unknown as Partial<AnyAdapter<K>>);
                    }}
                  />
                </SettingRow>

                {privateFilterMode !== 'off' && (
                  <div className=\"px-4 py-3\">
                    <Field
                      label=\"QQ号\"
                      placeholder=\"10001, 10002\"
                      value={userIdsText}
                      onChange={setUserIdsText}
                      error={privateFilterError}
                    />
                  </div>
                )}

                <SettingRow
                  label=\"关键词过滤\"
                  desc=\"按消息内容过滤此节点收到的私聊和群聊消息，可限制到指定群聊\"
                >
                  <DropdownSelect
                    className=\"w-32\"
                    ariaLabel=\"关键词过滤模式\"
                    value={keywordFilterMode}
                    options={GROUP_FILTER_OPTIONS}
                    onChange={(next) => {
                      if (next === 'off') {
                        patch({ keywordFilter: undefined } as unknown as Partial<AnyAdapter<K>>);
                        return;
                      }
                      patch({
                        keywordFilter: {
                          mode: next,
                          patterns: parsedKeywords.error ? [] : parsedKeywords.patterns,
                          ...(wsDraft?.keywordFilter?.regex ? { regex: true } : {}),
                          ...(keywordScopeEnabled && !parsedKeywordGroupIds.error
                            ? { groupIds: parsedKeywordGroupIds.groupIds }
                            : {}),
                        },
                      } as unknown as Partial<AnyAdapter<K>>);
                    }}
                  />
                </SettingRow>

                {keywordFilterMode !== 'off' && (
                  <div className=\"flex flex-col gap-3 px-4 py-3\">
                    <div className=\"flex flex-col gap-1.5\">
                      <Label>关键词（每行一个）</Label>
                      <Textarea
                        className=\"min-h-24 rounded-xl font-mono text-xs\"
                        value={keywordsText}
                        onChange={(e) => setKeywordsText(e.target.value)}
                        placeholder={keywordRegex ? '广告|推广\\n\\\\d{6,}' : '广告\\n推广链接'}
                        aria-invalid={!!keywordFilterError}
                      />
                      {keywordFilterError && <p className=\"text-xs text-destructive\">{keywordFilterError}</p>}
                    </div>
                    <SettingRow label=\"使用正则表达式\" desc=\"开启后每行按正则表达式匹配\">
                      <ToggleSwitch
                        value={keywordRegex}
                        onChange={(v) => patch({
                          keywordFilter: {
                            mode: keywordFilterMode as GroupMessageFilterMode,
                            patterns: parsedKeywords.error ? [] : parsedKeywords.patterns,
                            ...(v ? { regex: true } : {}),
                            ...(keywordScopeEnabled && !parsedKeywordGroupIds.error
                              ? { groupIds: parsedKeywordGroupIds.groupIds }
                              : {}),
                          },
                        } as unknown as Partial<AnyAdapter<K>>)}
                        ariaLabel=\"使用正则表达式\"
                      />
                    </SettingRow>
                    <SettingRow label=\"仅应用于指定群聊\" desc=\"开启后，群聊关键词规则只检查下方列出的群；私聊仍按关键词规则过滤\">
                      <ToggleSwitch
                        value={keywordScopeEnabled}
                        onChange={setKeywordScopeEnabled}
                        ariaLabel=\"仅应用于指定群聊\"
                      />
                    </SettingRow>
                    {keywordScopeEnabled && (
                      <Field
                        label=\"关键词过滤群号\"
                        placeholder=\"985983966, 787682322\"
                        value={keywordGroupIdsText}
                        onChange={setKeywordGroupIdsText}
                        error={keywordScopeError}
                      />
                    )}
                  </div>
                )}

                <SettingRow
                  label=\"节点消息前缀\"
                  desc=\"指定群内只有带此前缀的消息才进入此节点；转发前自动移除前缀\"
                >
                  <ToggleSwitch
                    value={prefixEnabled}
                    onChange={setPrefixEnabled}
                    ariaLabel=\"节点消息前缀\"
                  />
                </SettingRow>

                {prefixEnabled && (
                  <div className=\"flex flex-col gap-3 px-4 py-3\">
                    <Field
                      label=\"前缀\"
                      placeholder=\"/airi\"
                      value={prefixText}
                      onChange={setPrefixText}
                      error={prefixValueError}
                    />
                    <Field
                      label=\"应用群号\"
                      placeholder=\"985983966, 787682322\"
                      value={prefixGroupIdsText}
                      onChange={setPrefixGroupIdsText}
                      error={prefixGroupError}
                    />
                    <p className=\"text-xs leading-relaxed text-muted-foreground\">
                      例如配置 /airi 后，“/airi 你好”进入此节点时会变成“你好”；未列出的群和私聊不要求此前缀。
                    </p>
                  </div>
                )}
              </>
            )}

""" + old_report
replace_once(old_report, filters_ui)

replace_once(
"""const WS_ROLE_OPTIONS: ReadonlyArray<DropdownOption<WsRole>> = [
  { value: 'Universal', label: 'Universal' },
  { value: 'Event', label: 'Event' },
  { value: 'Api', label: 'Api' },
];""",
"""const WS_ROLE_OPTIONS: ReadonlyArray<DropdownOption<WsRole>> = [
  { value: 'Universal', label: 'Universal' },
  { value: 'Event', label: 'Event' },
  { value: 'Api', label: 'Api' },
];

const GROUP_FILTER_OPTIONS: ReadonlyArray<DropdownOption<GroupFilterUiMode>> = [
  { value: 'off', label: '不启用' },
  { value: 'blacklist', label: '黑名单' },
  { value: 'whitelist', label: '白名单' },
];""",
)

path.write_text(text, encoding='utf-8')
print(f'patched {path}')
