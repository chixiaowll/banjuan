# 局域网直连同步设计(LAN Direct Sync)

日期:2026-05-31
状态:设计已确认,待写实现计划

## 背景与动机

当前多端同步基于 **WebDAV**:用户需要自己搭建或租用 WebDAV 服务(坚果云 / NextCloud / 自建),配置繁琐,且数据要经过第三方服务器。

用户的核心诉求:
- **不想搭/租服务器** —— 设备之间直接传,不依赖任何云。
- **就近一键同步** —— 设备靠近(同一 Wi-Fi)时,点一下就能同步。

设备使用前提:要同步的设备基本都在**同一个 Wi-Fi**(家庭网/办公网)下。

### 为什么不是蓝牙

用户最初设想用蓝牙直连。经评估**不可行**(作为主传输):
- **速度**:跨平台唯一可用的 BLE 实测有效吞吐 ~5–50 KB/s;而同步范围包含原始 PDF/EPUB(书库可达数 GB,整文件传无 delta),传输时间不可接受。经典蓝牙(SPP/OBEX)虽快,但见下。
- **iOS 封死**:经典蓝牙传任意数据需 MFi 认证;Capacitor 跑在 WKWebView 无 Web Bluetooth,须上原生 BLE 插件且后台限制严。对正在做的 iPad app 是致命问题。
- **模型不匹配**:现有同步抽象是"远端文件仓库"模型,蓝牙是点对点、间歇、无服务端,需重做同步模型。

蓝牙最多只能当"发现/握手"的辅助信道,传不了数据 —— 不采用。

## 核心思路

**把 WebDAV 的服务端临时搬到本地设备上跑。** 一台设备临时充当 **host**,通过内嵌的小型 HTTP 服务把自己的**书库根目录**暴露在局域网里;另一台充当 **client**,用**现有的同步管线**连过去做双向同步。

现有 `SyncService` 的增量逻辑、last-write-wins 冲突解决、快照删除追踪、同步后重建 SQLite 索引 —— **全部不改**,只替换"远端"为局域网里的对端设备。

```
[Client 设备]                         [Host 设备]
  现有 SyncService                       LanHostServer(内嵌 HTTP)
  现有 WebDAV(Fetch)Adapter ─ HTTP(LAN) ─►  暴露【整个书库根目录】
  (URL 指向对方 IP:端口)                  ├─ 原始 PDF/EPUB(根目录及子目录)
        ▲                                └─ .banjuan/(元数据/标注/笔记/标签)
        │                                 (沿用现有同步的排除规则)
        └────── mDNS 发现 + PIN 配对 ──────────┘
```

## 关键设计决定

### 1. host / client 角色

| 平台 | 能当 host? | 能当 client? |
|---|---|---|
| 桌面(Electron,Mac/Win/Linux) | ✅ | ✅ |
| 移动(Capacitor,iOS/Android) | ❌(v1) | ✅ |

- **任何桌面**都能当 host 也能当 client —— 桌面有 Node 运行时,起内嵌 HTTP 服务几乎零成本。
- **移动端 v1 只能当 client** —— 在 WKWebView 里跑 HTTP 文件服务需要额外原生插件,是最重的部分;而真实场景里桌面(尤其 Mac)几乎总在线当"大本营"。移动端只需做"mDNS 发现 + HTTP 客户端",WKWebView 现成能跑。
- 后续若要"移动端也能当 host",单独增量添加,不影响现架构。

由此覆盖的场景:
- **Mac ↔ Mac / Windows ↔ Mac**:完全对等,任意一台点"开启共享"当 host,另一台连过去。
- **iPad ↔ Mac**:Mac 当 host,iPad 当 client。
- **iPad ↔ iPhone**:v1 不支持(都不能当 host);因 Mac 通常在线,影响有限。

### 2. 同步是双向的

"host" 只是"谁跑那个 HTTP 服务"的角色,**与数据源无关**。现有 `SyncService` 本就是双向的 —— 按 mtime 对每个文件决定 upload 还是 download。只要 host 服务支持 GET(下载)和 PUT/DELETE(上传/删除),跑在 client 上的 `SyncService` 就完成**完整双向同步**:既拉下对端新文件,也推上自己的新标注/笔记。

### 3. 同步范围

host 暴露的是**整个书库根目录(rootPath)**,与现有 WebDAV 同步范围**完全一致**:
- **包含**:根目录及子目录下的原始 PDF/EPUB + `.banjuan/`(元数据 documents/、标注 annotations/、笔记 notes/、标签 tags.json)。
- **排除**(沿用现有规则):`db.sqlite` / `db.sqlite-wal` / `db.sqlite-shm`、`library.db`、`db.meta.json`、`.DS_Store`、`plugins/`;受保护文件 `.banjuan/config.json` / `.banjuan/sync.json` 不删除。

因为现有 `SyncService` 遍历的就是这个范围,换成 LAN 传输后"传哪些 / 排除哪些"一行不用改。

### 4. host 服务协议:极简 WebDAV 子集(选项 1)

host 实现 WebDAV 的最小动词集:
- `PROPFIND` —— 列目录 + 返回 `getlastmodified`(mtime)、size。
- `GET` —— 下载文件。
- `PUT` —— 上传文件。
- `DELETE` —— 删除文件。
- `MKCOL` —— 建目录。

理由:**client 端零改动** —— 直接复用现有 `WebDAVAdapter`(桌面)与 `WebDAVFetchAdapter`(移动),仅把 URL 指向 `http://<对方IP>:端口`、带上鉴权头。桌面用 Node 原生 `http` 模块手写这 5 个动词,把文件系统操作映射成 HTTP 响应即可。PROPFIND 需拼一点 XML,但 `WebDAVFetchAdapter` 里已有解析该 XML 的代码,格式对得上。

(放弃的选项 2:自定义 JSON+二进制协议。server 端不用拼 XML 更直观,但要新写 `LANAdapter` 且桌面/移动两套 client 都要对接,总代码量反而更多。)

### 5. 配对与鉴权:PIN + token,v1 明文 HTTP

1. host 开启共享时生成**会话 token**,并显示 **6 位 PIN**(或二维码,内含 `IP:端口 + token`)。
2. client 发现后**首次**输入 PIN(或扫码)→ 换取 token → 持久化(同一对设备下次免输)。
3. 之后每个请求带 `Authorization: Bearer <token>`,host 校验,失败返回 401。

**传输安全**:v1 走**明文 HTTP**(局域网内、数据本为用户自有文件)+ token 鉴权。自签 TLS 列为后续增强项 —— 否则证书信任在 iOS/移动端引入额外麻烦。

### 6. 发现层 mDNS/Bonjour

- 开启共享的设备广播服务 `_banjuan-sync._tcp`,TXT 记录含:设备名、书库名、端口、协议版本。
- client 浏览同名服务 → 得到"附近可同步设备"列表。
- **桌面**:Node 端 mDNS 库(如 `bonjour-service`)。
- **移动**:zeroconf Capacitor 插件;**iOS 必需**在 Info.plist 添加 `NSLocalNetworkUsageDescription`(本地网络权限)与 `NSBonjourServices` 声明服务类型。
- **兜底**:扫不到时(防火墙 / 跨网段)允许**手动输入 IP:端口**或扫二维码,不依赖 mDNS 也能连。

## 交互流程

1. 设备 A 点「开启共享」→ 起 HTTP 服务 + 开始 mDNS 广播 + 显示 PIN/二维码。
2. 设备 B 点「连接附近设备」→ 列表看到 A → 首次输 PIN(或扫码)→ 存下 token。
3. B 上跑现有 `SyncService` 指向 A → 双向同步,沿用现有"扫描 → 同步 → 重建索引"进度 UI。
4. 同步完成,A 可关闭共享(停服务、停广播)。

## 异常处理

- **同步中 Wi-Fi 掉线 / 对端消失**:整文件传 + 幂等,快照仅在结束时更新 → 中断只是本次未传完,重连后下次继续,不损坏数据(沿用现有语义)。
- **token 失效 / 换了 PIN**:client 收到 401 → 提示重新配对。
- **端口被占**:host 起服务时自动选空闲端口,写入 mDNS TXT 记录。
- **两端同时改同一书库**:沿用现有 last-write-wins + 1 秒宽限,不引入新冲突模型。

## 模块划分

各模块单一职责、接口清晰、可独立测试:

1. **`LanHostServer`(桌面 / core+node)** —— 将书库根目录映射成极简 WebDAV(5 动词),token 鉴权;自动选空闲端口。
2. **`DiscoveryService`** —— mDNS 广播/浏览;桌面 Node 版与移动插件版实现同一接口。
3. **`PairingService`** —— PIN/token 生成与校验、token 持久化(按对端设备存)。
4. **client(复用)** —— 现有 `SyncService` + `WebDAVAdapter` / `WebDAVFetchAdapter`,URL 与鉴权头来自配对结果。
5. **UI** —— 「开启共享」面板(PIN/二维码)+「附近设备」列表,接入现有同步进度 UI。

## 测试策略

- **core 单测**:`LanHostServer` 的 5 个动词(PROPFIND/GET/PUT/DELETE/MKCOL),用临时目录验证文件系统映射与鉴权(无 token → 401)。
- **集成测试(关键)**:把现有 `WebDAVFetchAdapter` 指向本地 `LanHostServer`,跑一遍完整 `SyncService`(双向同步 + 删除追踪 + 冲突),证明"复用现有管线"成立。
- **手动验证**:mDNS 发现、PIN/二维码配对、移动端本地网络权限提示、跨平台(Mac↔Win、Mac↔iPad)。

## 不在 v1 范围(YAGNI / 后续增强)

- 移动端当 host。
- 自签 TLS 加密传输。
- 完全离线点对点(Wi-Fi Direct / Multipeer)—— 跨平台成本过高,当前需求(设备同 Wi-Fi)用不到。
- delta / 分块增量传输 —— 现有整文件 + stub 懒下载已够用。
- 后台自动同步 —— 沿用现有"手动触发"。
