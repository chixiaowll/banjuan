# 同步配对安全设计(设备身份 · 持久化配对 · 书房身份校验)

日期:2026-05-31(2026-05-31 升级为持久化配对模型)
状态:设计待评审
关联:[LAN 直连同步 Plan 1](../plans/2026-05-31-lan-direct-sync-plan1-engine.md)、[同步正确性设计](2026-05-31-sync-correctness-design.md)

## 背景与风险

LAN 直连同步目前有两个缺口:

1. **不校验两端是不是同一个书房**——在书房 A 开共享、用书房 B 连过去,会把 A、B 内容**双向互灌**,两边都被污染(静默破坏数据)。
2. **没有持久信任**——host 每次重启 PIN/端口都变,用户每次都得重新输 PIN,难以长期使用。

本设计引入**设备身份 + 持久化配对清单 + 书房身份校验**,让 LAN 同步"链接一次、以后免 PIN、可断开、且绝不误合并不同书房"。

## 身份模型

### 书房身份 `LibraryConfig.id`
- init 生成:`id = sha256(rootPath + '|' + createdAt).slice(0, 32)`(用现有 `deps.crypto.sha256`,无需新增 crypto)。
- open 补全:老库无 `id` 时生成并写回(幂等)。
- 同一逻辑书房在两台设备上初始 id 也不同 —— 靠"配对采纳"让它们认作同一个(见下)。

### 设备身份(每个安装一份,设备全局)
- `~/.banjuan/device.json`:`{ deviceId: <uuid>, deviceName: <默认主机名,可改> }`,首次启动生成。
- 标识"这台设备",用于配对清单里识别对端。

### 配对清单(每书房一份,设备本地)
- `.banjuan/paired-devices.json`:本书房链接过的对端设备列表:
```json
[{
  "peerDeviceId": "...",
  "peerDeviceName": "我的 iPad",
  "peerLibraryId": "<对端书房 id>",
  "token": "<两端共享的长期令牌>",
  "linkedAt": "2026-05-31T..."
}]
```
- `token` 两端各存一份(同一个值),双向通用:谁当 host 谁就用它校验来访;谁当 client 谁就用它去认证。

### 不参与同步的本地文件
`.banjuan/config.json`(name + 书房 id)和 `.banjuan/paired-devices.json` 都是**设备本地身份**,**从 LAN 同步中排除**(整文件不传不删),否则会互相覆盖、破坏身份与信任。
- 实现:`SyncService` 增加按完整相对路径排除的集合 `SYNC_EXCLUDED_PATHS = { '.banjuan/config.json', '.banjuan/paired-devices.json' }`,在 `collectLocalFiles` / `collectRemoteFiles` 跳过。(不能用按 basename 的 `EXCLUDED_NAMES`,会误伤插件等其它 config.json。)
- 连带:**书房名变成每设备本地**(已确认接受)。`tags.json` 等共享内容仍同步。

## host 端点

LAN host(`LanHostServer` 启动时读 `config.json` 拿 `libraryId`/`libraryName`,读 `~/.banjuan/device.json` 拿 `deviceId`/`deviceName`,读 `paired-devices.json` 拿已授权 token 集):

1. **`GET /.banjuan-info`(无需认证)** → `{ deviceId, deviceName, libraryId, libraryName }`。client 用它判断"这台 host 我配对过没有"。
2. **`GET /.banjuan-pair?pin=NNNNNN`(PIN 门槛)** → PIN 正确则**签发长期 token**,把来访设备加进自己的 `paired-devices.json`,返回 `{ token, deviceId, deviceName, libraryId, libraryName }`。PIN 只用于**新设备首次链接**。
3. **WebDAV 动词**:`Authorization: Basic`,密码须命中 `paired-devices.json` 里任一已授权 token(持久,不再是每次会话的临时 token)。

PIN 仍是临时的(host 每次开共享生成一个,仅供加新设备),但 token 是持久的。

## client 连接流程

用户在"连接附近设备"填对端地址(IP:端口仍需手填,mDNS 自动发现在 Plan 2),点连接:

1. `GET {url}/.banjuan-info` → 得到 host 的 `deviceId` + `libraryId` + 名称。
2. 在本地 `paired-devices.json` 按 `peerDeviceId` 查:
   - **已配对** → 取出 token → 直接用它跑同步(**免 PIN**)。
   - **未配对** → 进入链接流程:提示输 PIN → `GET /.banjuan-pair?pin=` → 拿到 token,把 host 设备写进本地清单;host 也把本机写进它的清单。**双方互相记下。**
3. **书房身份校验**(链接时做一次,方案 B):
   | 本地书房 id vs host libraryId | 本地是否空(0 文档) | 行为 |
   |---|---|---|
   | 相同 | — | 链接并同步 |
   | 不同 | 空 | 采纳 host 的 libraryId(写本地 config),链接并同步 |
   | 不同 | 非空 | 不同步,回传 `{ needsConfirm, peerName, localName }`;UI 强确认后才以 `force=true` 链接、采纳并合并 |
4. 同步:跑现有 `SyncService` + `rebuildFull`。

## 链接 / 断开(删除)操作 + UI

"同步"面板新增**"已连接设备"列表**:
- 每项显示对端设备名 + 对端书房名 + 链接时间,带一个**删除(断开)**按钮。
- **删除**:从本地 `paired-devices.json` 移除该项(作废其 token)。
  - 若本机是该 token 的 host,删除即**吊销**对方访问(对方再连被拒,需重新 PIN 链接)。
  - 完全互断需两端各删一次(无在线协商,v1 接受)。
- **添加设备**:填对端地址 +(首次)PIN,走上面的链接流程。
- 列表为空时提示"还没有链接任何设备"。

API:`api.lan` 增加 `listPairedDevices()`、`unpairDevice(peerDeviceId)`;`connectAndSync` 内部自动走"已配对/新链接"两条路并支持 `force`。

## 场景验证

- **A 开 host、B 连**(两个都非空、id 不同)→ 链接阶段命中"非空 + 不同" → 强确认拦下,不误合并。✓
- **新 iPad 建空库拉 Mac**(client 空)→ 采纳 host id,顺畅克隆。✓
- **链接过的两端再次同步**(host 重启、新端口/新 PIN)→ client 经 `/.banjuan-info` 认出已配对 → 用长期 token 直连,**免 PIN**。✓
- **断开**:在列表删除对端 → 对方下次连被拒。✓

## 安全保证

- `config.json` / `paired-devices.json` 不同步 → 身份与信任永不被对端覆盖。
- 身份校验在**链接阶段、同步前**完成 → 危险合并在传任何文件前被拦。
- 默认拒绝合并不同书房(方案 B 仅显式确认放行)。
- 持久 token 落在书房本地、不同步;PIN 仅用于新链接;可随时删除吊销。
- 老库平滑兼容:open 补 id;无 `paired-devices.json` 视为空清单。

## 不在范围(后续 / 远期)

- **mDNS 自动发现对端地址**(Plan 2)——v1 仍手填 IP:端口;持久 token 省的是 PIN,不是地址。
- 跨设备"断开"的在线双向协商(v1 各端本地删)。
- TLS 加密传输(既有后续增强)。
- 3+ 设备的链接拓扑可视化 —— 清单已支持多对端,UI 先做平铺列表。

## 测试策略

- core 单测:`init` 生成 32 位 id;`open` 给老库补 id 并写回。
- 配对存储:写入/读取/删除 `paired-devices.json`;`token` 校验(命中放行、未命中 401)。
- host 端点:`/.banjuan-info` 返回身份;`/.banjuan-pair` 正确 PIN 签发 token 且记入清单,错误 PIN 403。
- 排除:`.banjuan/config.json` 与 `paired-devices.json` 不出现在同步传输中。
- 连接逻辑:已配对→免 PIN 直连;未配对→需 PIN;id 相同→同步;空 client+id 不同→采纳;非空+id 不同+force=false→needsConfirm 且未传文件;force=true→合并采纳。
- 断开:删除后该 token 失效(host 拒绝)。
