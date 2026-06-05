# 移动端 LAN client 设计(iPad / Capacitor)

日期:2026-05-31
状态:设计已确认
关联:[LAN 发现 + 连接/同步分离](2026-05-31-lan-discovery-connect-sync-design.md)、[配对安全设计](2026-05-31-sync-pairing-safety-design.md)

## 背景

桌面端已完成:LAN 直连同步、mtime 收敛、书房身份护栏、持久化设备配对、mDNS 发现 + 连接/同步分离。本 spec 把这套带到**移动端(iPad/iPhone,Capacitor)**,让 iPad 当 **client** 去连桌面 host 同步。

**关键事实**:移动端 `Library` + `SyncService` 跑在 **renderer(WKWebView)**,用 `CapacitorFS`(`packages/platform-capacitor`)。所以 pair/sync 逻辑能在 `packages/mobile/src/capacitor-api.ts` 里**复用 `@banjuan/core` 重写一套**,无需写原生同步代码。`PairingStore` 只用 exists/readTextFile/writeTextFile,CapacitorFS 全支持。

**前提限制(已知,接受)**:mDNS 原生插件 + iOS 本地网络权限**无法在开发 Mac 上完整验证**,需 iPad 真机/模拟器构建测;逻辑层可写好并 typecheck。

## 角色

移动端**只当 client**(浏览发现、连接、同步),**不当 host**(不广播、不开服务)。`startHost/stopHost/getHostStatus` 在移动端返回"不支持/offline";UI 隐藏"开启共享"块。

## 组件

### 1. 移动端设备身份 `packages/mobile/src/capacitor-device-identity.ts`
- `getDeviceIdentity(): Promise<{deviceId, deviceName}>`,用 `@capacitor/preferences` 持久化(key `banjuan.device`)。首次生成 `deviceId`(32 位 hex,`crypto.randomUUID().replace(/-/g,'')`,WebCrypto 在 WKWebView 可用),`deviceName` 取 `@capacitor/device` 的设备名(取不到则默认 "iPad/iPhone")。
- 新增依赖:`@capacitor/preferences`、`@capacitor/device`。
- 与桌面 `device-identity.ts` 同形(deviceId/deviceName),但异步(Preferences 是异步)。

### 2. 移动端 zeroconf 发现 `packages/mobile/src/capacitor-mdns.ts`
- 包一个社区 Capacitor zeroconf 插件(浏览 `_banjuan-sync._tcp`,**只 browse 不 publish**)。候选:`capacitor-zeroconf`(jimmckee/社区)。实际包名/可用性在实现首步确认;插件不可用时该任务回退为 BLOCKED 并上报(不硬塞)。
- `scanNearby(timeoutMs=2000): Promise<NearbyShare[]>` —— 浏览一段时间,把发现的服务用与桌面一致的解析逻辑(读 lowercase txt:deviceid/devicename/libraryid/libraryname + 选 IPv4 + 拼 url)映射成 `NearbyShare`,按 deviceId 去重。
- 复用桌面纯函数 `parseNearbyService` 的字段口径(可把该纯函数提到 `@banjuan/core` 复用,或在移动端复制同样逻辑——实现时取复用)。
- iOS `Info.plist`(`packages/mobile/ios/App/App/Info.plist`)新增:`NSLocalNetworkUsageDescription`(中文说明文案)+ `NSBonjourServices = ['_banjuan-sync._tcp']`。

### 3. `api.lan.*` 移动端实现(`packages/mobile/src/capacitor-api.ts`,新增 `lan` 命名空间)
- `scanNearby()` → `capacitor-mdns.scanNearby()`。
- `pairDevice(peerUrl, pin)` → `CapacitorHttp` GET `{peerUrl}/.banjuan-info`(取 hostDeviceId/deviceName/libraryId/libraryName)→ GET `/.banjuan-pair?pin&deviceId&deviceName&libraryId`(本机身份)→ token → `new PairingStore(lib.rootPath, fs).addOrUpdate(...)`;返回 `{ok, deviceName, libraryName}`。
- `syncDevice(peerUrl, onProgress?, force?)` → GET `/.banjuan-info` → 按 hostDeviceId 查 PairingStore;无 → `{needsPair:true}`;书房护栏(本地空 或 force→`adoptLibraryId`;不同→`{needsConfirm,...}`);用 token 跑 `SyncService` + `CapacitorWebDAVAdapter` + 同步后重建索引。
- `listPairedDevices()` / `unpairDevice(id)` → PairingStore(list 剥离 token,不回传密钥,和桌面一致)。
- `startHost/stopHost/getHostStatus` → 移动端只当 client:`getHostStatus` 返回 `{running:false,url:null,pin:null,port:null}`;`startHost`/`stopHost` no-op(或抛 `HOST_UNSUPPORTED`)。
- 所有调用经 `CapacitorHttp`(绕过 WebView CORS,可访问 `http://<mac-ip>:port`)。

### 4. `CapacitorWebDAVAdapter` 带 mtime(`packages/mobile/src/capacitor-webdav-adapter.ts`)
- `upload(localPath, remotePath, mtimeMs?)` 加可选 `mtimeMs`,PUT 时带 `X-Banjuan-Mtime` 头(对齐桌面,host 据此保留上传文件 mtime)。
- ⚠️ 已知限制:Capacitor Filesystem **无法设置文件 mtime**(没有 utimes),所以移动端**下载不保留 mtime** → `SyncService.preserveMtime` 在移动端 best-effort(no-op,因为 `CapacitorFS.setMtime` 未实现)→ 移动↔桌面同步存在部分重复传(收敛不完美)。v1 接受,记为后续(需移动端写 mtime 的原生能力)。

### 5. UI:移动端隐藏 host 块
- `SyncConfigPanel` 的"开启共享(本机作为 host)"块在移动端隐藏(client-only);"附近的共享 / 扫描 / 连接 / 同步 / 已连接设备 / 手动连接"保留。
- 机制:新增能力标志,如 `api.lan.canHost?: boolean`(桌面 true、移动 false),或面板按平台判断;实现时取最小改动(优先 `canHost` 标志)。

## 数据流(iPad 作为 client)

```
Mac: 开启共享 → 广播 _banjuan-sync._tcp（已完成)
iPad: 扫描 → capacitor zeroconf browse → NearbyShare[]（设备名·书房名）
      连接 → pairDevice(url, PIN) → CapacitorHttp 配对 → 存 token（不传数据)
      同步 → syncDevice(url) → 书房护栏 → SyncService(CapacitorWebDAVAdapter) 双向同步
```

## 异常处理

- zeroconf 插件不可用/未授权本地网络 → scanNearby 空列表 + 手填地址兜底;首次触发 iOS 本地网络权限弹窗。
- `syncDevice` 未配对 → `needsPair`(UI 提示先连接)。
- 不同书房 → `needsConfirm` 强确认(force 才合并)。
- host 不在线/扫不到 → 空列表;手填地址连不上 → 错误提示。
- PIN 错 → pairDevice 报错。

## 复用 & 不重做
复用:`PairingStore`、`/.banjuan-info`、`/.banjuan-pair`、`SyncService`、`CapacitorWebDAVAdapter`、桌面已建的整套 `SyncConfigPanel` UI(scan 列表 / 连接 / 同步 / 已连接列表)、`parseNearbyService` 字段口径、书房身份护栏。

## 不在范围(后续)
- 移动端当 host(广播 + 内嵌服务)——移动端仍只 client。
- 移动端写文件 mtime(原生能力)以完善收敛。
- 冲突副本正确性(独立 spec,跨平台共用)、TLS。

## 测试策略
- `parseNearbyService` 口径:复用桌面纯函数单测(若提到 core)。
- 设备身份:Preferences 读写(可在有 Preferences mock 时单测;否则手测)。
- pairDevice/syncDevice 逻辑:typecheck 为主门槛(renderer 内逻辑,依赖 CapacitorHttp/插件,难纯单测);桌面侧 `/.banjuan-info`/`/.banjuan-pair`/host 持久 token 已被桌面测试覆盖,移动端是同一协议的另一个客户端。
- **真机/模拟器手测(必需)**:iPad 扫描发现 Mac、首次本地网络权限弹窗、连接(PIN)、同步、断开;不同书房强确认;mtime 限制下的重复传观察。
- 既有桌面 32 测试与各 typecheck 不破。
