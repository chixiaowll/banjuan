# 局域网发现 + 连接/同步分离设计(桌面,蓝牙式)

日期:2026-05-31
状态:设计已确认
关联:[LAN 直连同步 Plan 1](../plans/2026-05-31-lan-direct-sync-plan1-engine.md)、[配对安全设计](2026-05-31-sync-pairing-safety-design.md)

## 背景

LAN 直连同步现在要**手填对端 IP:端口**,且"连接并同步"是一个动作,不够清晰。目标:做成**蓝牙鼠标/键盘那样**——扫描发现附近共享(显示设备名 + 书房名),client 点"连接"一次性配对,"同步"是另一个独立动作。

**范围**:本 spec 只做**桌面**(Node mDNS)。移动端(iPad)的发现与 LAN client 是独立子系统(需 Capacitor zeroconf 插件、iOS 本地网络权限、移动端 pair/sync 接线),作为**后续 Spec B** 单独做——会复用本 spec 的 UI 与 core 逻辑。

## 语义(已确认)

- **连接 = 一次性配对**(输一次 PIN,像蓝牙配对)。配对后设备进"已连接"列表,**不自动同步**。
- **同步 = 独立动作**。对已配对、且当前在线(扫到)的设备点"同步"才传数据。
- **书房合并护栏挪到"同步"阶段**:配对只建立信任、不动数据;合并不同书房的风险只在真正传数据时拦(空→采纳 host id,不同→强确认 force)。

## 组件

### 1. `DiscoveryService`(packages/app/src/main,Node `bonjour-service`)

新增依赖 `bonjour-service`。封装 mDNS 广播与浏览,服务类型 `_banjuan-sync._tcp`。

- **广播(host)**:`advertise({ port, deviceId, deviceName, libraryId, libraryName })` —— 在 host 起服务时发布,TXT 记录携带这四个身份字段;`stop()` 撤销。
- **浏览(client)**:`scan(timeoutMs = 1500): Promise<NearbyShare[]>` —— 浏览一段时间,收集 `up` 的服务,返回 `NearbyShare[] = { deviceId, deviceName, libraryName, libraryId, url }`,其中 `url = http://<服务解析出的 IPv4>:<port>`(优先非内网回环的 IPv4;同机回环用 127.0.0.1 也可)。
- 接口清晰、单一职责:广播只管发布,扫描只管收集快照。v1 用"扫描返回快照"模型(不做长连推送),够用且简单。

### 2. host 广播接入 `LanHostServer`

`lan:startHost` 起服务后,调用 `DiscoveryService.advertise(...)`(用已读到的 deviceId/deviceName/libraryId/libraryName + 端口);`lan:stopHost` 调 `DiscoveryService.stop()`。广播归属与 host 单例一致(只有开共享的窗口在广播)。

### 3. 拆分的 IPC(连接 vs 同步)

- **`lan:scanNearby(): Promise<NearbyShare[]>`** —— client 扫描附近共享,返回快照。
- **`lan:pairDevice(peerUrl, pin): Promise<{ ok: true; deviceName: string; libraryName: string } | { error: string }>`**
  - GET `{peerUrl}/.banjuan-info` → host 身份;
  - GET `{peerUrl}/.banjuan-pair?pin&deviceId&deviceName&libraryId`(本机身份)→ token;
  - `PairingStore.addOrUpdate({ peerDeviceId, peerDeviceName, peerLibraryId, token })`;
  - **不同步**,返回成功 + 对端名字。PIN 错 → `PAIR_FAILED:403`。
- **`lan:syncDevice(peerUrl, force?): Promise<SyncResult | { needsPair: true } | { needsConfirm: true; peerName; localName }>`**
  - GET `/.banjuan-info` → hostDeviceId/libraryId/libraryName;
  - 按 hostDeviceId 查 `PairingStore`;**没配对 → 返回 `{ needsPair: true }`**(UI 提示先连接);
  - **书房身份护栏**(localId vs hostLibraryId:相同→同步;本地空 或 force→`adoptLibraryId` 后同步;非空且不同且无 force→`{ needsConfirm, peerName, localName }`);
  - 用存的 token 跑现有 `WebDAVAdapter` + `SyncService` + `rebuildFull`。
- **`lan:listPairedDevices` / `lan:unpairDevice`**:沿用(listPairedDevices 已剥离 token,不回传密钥)。
- 旧的 `lan:connectAndSync` 由 pair+sync 取代;移除它及其 preload/api 入口(没有其它调用方)。

### 4. UI(packages/shared-ui SyncConfigPanel)—— 仿蓝牙

- **附近的共享**:`扫描`按钮 → `api.lan.scanNearby()` → 列表,每行 `设备名 · 书房名`。
  - 该设备**未配对** → 显示 **连接**:点 → 弹 6 位 PIN → `pairDevice(url, pin)` → 成功后刷新已连接列表。
  - 该设备**已配对** → 显示 **同步**:点 → `syncDevice(url)`(在 sync 阶段处理 needsConfirm 强确认)。
- **已连接设备**(沿用):列出 `PairingStore` 的设备;若本次扫描在线 → **同步**可用(用扫到的 url);**断开**始终可用;离线灰显。
- **开启共享**(host 角色)保留;另保留"手填地址 + 连接"的兜底入口(发现失败时)。
- 扫描中显示 loading;扫不到显示"附近没有发现共享的设备"。

### 5. 数据流

```
host: 开启共享 → LanHostServer.start + DiscoveryService.advertise(身份+端口)
client: 扫描 → DiscoveryService.scan → NearbyShare[]（含 url）
       连接 → pairDevice(url, PIN) → 存 token（不传数据）
       同步 → syncDevice(url) → 身份护栏 → SyncService 双向同步
```

## 异常处理

- 扫不到(防火墙/跨网段)→ 空列表 + 手填地址兜底。
- `syncDevice` 未配对 → `needsPair`,UI 提示"请先连接"。
- 已配对但离线(没扫到)→ 同步按钮禁用/提示设备不在线。
- stale token(对方已断开你)→ 沿用现状(同步报错,用户可断开重连);自动恢复仍是已知后续小尾巴,不在本 spec。
- PIN 错 → `pairDevice` 返回错误,UI 提示。

## 复用 & 不重做

复用:`PairingStore`、`/.banjuan-info`、`/.banjuan-pair`(已带身份 + recordPairing)、host 持久 token 鉴权、`Library.getId/adoptLibraryId/getName/documents.list`、`WebDAVAdapter` + `SyncService`、`getDeviceIdentity`。

## 不在范围(后续)

- **移动端(iPad)发现 + LAN client**(Spec B):Capacitor zeroconf、iOS `NSLocalNetworkUsageDescription`/`NSBonjourServices`、移动端 pair/sync 接线、device.json 存 Capacitor FS。
- stale-token 自动恢复、TLS、长连实时发现推送(v1 用扫描快照)。

## 测试策略

- `DiscoveryService`:advertise 后 scan 能发现自己(本机 mDNS 回环),返回的 NearbyShare 含正确 deviceId/libraryName/url;stop 后扫不到。(集成测试,真实 bonjour-service,本机回环。)
- `lan:pairDevice`:成功存配对且**不产生同步**(对端无文件变化);PIN 错 → 错误。
- `lan:syncDevice`:未配对 → needsPair(不建 adapter、不同步);已配对 → 走护栏 + 同步;非空+不同书房+无 force → needsConfirm(不同步);force → 采纳 + 合并。
- UI:扫描列表渲染;未配对显"连接"、已配对显"同步";断开后该设备回到未配对态。
- 既有 32 个 core 测试与 Plan 1/2 行为不破。
