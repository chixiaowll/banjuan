# 同步配对安全设计(书房身份校验)

日期:2026-05-31
状态:设计待评审
关联:[LAN 直连同步 Plan 1](../plans/2026-05-31-lan-direct-sync-plan1-engine.md)、[同步正确性设计](2026-05-31-sync-correctness-design.md)

## 背景与风险

LAN 直连同步目前**不校验两端是不是同一个书房**——它只是把两个目录的文件树按 mtime 合并。因此:

> 在书房 A 开启共享,用书房 B 的 client 连过去 → A、B 的内容会**双向互灌**,两个书房都被污染。

这比报错更危险(静默破坏数据)。根因:`config.json` 里没有稳定的书房身份,同步层无从判断"该不该把这两端合并"。

## 设计决定

### 1. 书房身份 `id`

`LibraryConfig` 增加 `id: string`:
- **init 时生成**:`id = sha256(rootPath + '|' + createdAt).slice(0, 32)`,用现有 `deps.crypto.sha256`,无需新增 crypto 能力。
- **open 时补全**:老库若 `config.json` 无 `id`,生成一次并写回(幂等)。
- 性质:每台设备各自生成,**同一逻辑书房在两台设备上初始 id 也不同**——这是预期的;靠下面的"配对采纳"让它们认作同一个。

### 2. `config.json` 不参与同步(每设备本地持有)

书房的 `name` 与 `id` 是**设备本地身份/偏好**,不应随同步传播,否则:
- 空 client 刚建、mtime 更新的 `config.json` 同步上去会**覆盖 host 的 id/name**,破坏 host 身份,绕过护栏。

因此把 `.banjuan/config.json` 从 LAN 同步中**排除**(整文件不上传、不下载、不删除)。
- 连带行为变化(已确认接受):**书房名变成每台设备各自的**——一端改名不传到另一端。`id` 的"链接"只在配对时**显式**写本地,不靠同步。
- 实现:在 `SyncService` 增加一个按"完整相对路径"排除的集合 `SYNC_EXCLUDED_PATHS = { '.banjuan/config.json' }`,在 `collectLocalFiles` 与 `collectRemoteFiles` 里跳过。(现有的 `EXCLUDED_NAMES` 是按 basename 排除,不能用——会误伤插件等其它 config.json。)
- `tags.json` 等共享内容**仍然同步**,不受影响。

### 3. host 亮明身份

LAN host 在**配对响应**里附带书房身份。`LanHostServer` 启动时读 `.banjuan/config.json` 拿到 `id` + `name`,传入 `DavContext`;配对端点 `GET /.banjuan-pair?pin=` 的成功响应从 `{ token }` 扩展为:

```json
{ "token": "...", "libraryId": "<host id>", "libraryName": "<host name>" }
```

(身份只在配对成功后才返回,PIN 仍是前置门槛。)

### 4. client 配对校验(核心,采用方案 B)

`connectAndSync(peerUrl, pin, force?)` 在拿到 token + host 身份后、**同步前**判断:

| 本地 id vs host id | 本地是否空(0 文档) | 行为 |
|---|---|---|
| 相同 | — | 直接同步 |
| 不同 | **空** | **采纳** host id(写本地 `config.json`),然后同步(新设备加入,免打扰) |
| 不同 | 非空 | `force=false`:**不同步**,回传 `{ needsConfirm: true, peerName, localName }`;`force=true`:采纳 host id 后同步 |

- "空书房" = `(await library.documents.list()).length === 0`。
- **方案 B**:非空 + id 不同时,UI 弹强警告,用户确认才以 `force=true` 重连并硬合并;合并后采纳 host id(从此两端 id 相同,不再每次告警)。

### 5. UI 确认流程

`SyncConfigPanel.connectPeer`:
1. 调 `api.lan.connectAndSync(url, pin)`。
2. 若返回 `{ needsConfirm: true, peerName, localName }` → `confirm()` 强警告:
   > 对方是不同的书房「{peerName}」,当前是「{localName}」。继续会把两个书房**合并**,通常你不想这样。确定继续吗?
3. 用户确认 → 调 `api.lan.connectAndSync(url, pin, true)`;取消 → 中止,提示已取消。

## 场景验证

- **你担心的 A 开 host、B 连**(两个都非空、id 不同)→ 第一次返回 needsConfirm,弹强警告,默认不合并。✓
- **新 iPad 建空书房拉 Mac 的库**(client 空)→ 采纳 host id,顺畅克隆。✓
- **同一书房两端重复同步**(id 相同)→ 直接同步,无打扰。✓
- **配对前**:PIN 仍是门槛,身份信息只在 PIN 正确后返回。✓

## 安全保证

- `config.json` 不同步 → host 身份永不被 client 覆盖。
- 身份校验在**同步前**(配对阶段)完成,危险合并在传输任何文件前就被拦下。
- 默认拒绝合并不同书房(方案 B 仅在显式确认后放行)。
- 老库平滑兼容:open 时补 id,不影响既有数据。

## 不在范围

- 多端(3+)互联的身份拓扑、撤销链接 UI —— 远期。
- 把书房名做成可选"随同步传播" —— 暂不做(已定为每设备本地)。
- 加密传输(TLS)—— 既有计划里的后续增强。

## 测试策略

- core 单测:`Library.init` 生成 32 位 id;`open` 给无 id 的老库补 id 并写回。
- handler/host:配对响应包含 `libraryId` + `libraryName`。
- 集成:`.banjuan/config.json` 不出现在同步传输中(host 改名不传到 client)。
- ipc/连接逻辑:id 相同→直接同步;空 client + id 不同→采纳并同步;非空 + id 不同 + force=false→needsConfirm 且**未传任何文件**;force=true→合并并采纳。
