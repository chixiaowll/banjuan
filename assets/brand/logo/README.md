# 半卷 BanJuan · Logo Files

甲骨文「册」字 · 五简两绳 · 白底墨竹朱绳

## 文件清单

| 文件 | 用途 | 尺寸 |
|---|---|---|
| `banjuan-icon-1024.svg` | macOS App Icon / App Store 主图标（带圆角） | 1024 × 1024 |
| `banjuan-icon-square.svg` | 纯方形版本（无圆角，可自由裁剪） | 1024 × 1024 |
| `banjuan-mark.svg` | 纯 logo 符号（透明背景，可叠加） | 100 × 100 (vector) |
| `banjuan-mono.svg` | 单色墨版（印刷、邮件签名） | 100 × 100 (vector) |
| `banjuan-wordmark-horizontal.svg` | 横排品牌标识（logo + 文字） | 480 × 140 |
| `banjuan-wordmark-vertical.svg` | 竖排品牌标识 | 200 × 300 |

## 颜色规范

| 名称 | HEX | 用途 |
|---|---|---|
| 墨竹 | `#1A1815` | 主笔画 · 竹简 |
| 朱绳 | `#B73E2A` | 编绳 · brand 强调色 |
| 宣白 | `#FFFFFF` | App Icon 背景 |
| 灰注 | `#8A8377` | 辅助文字 / 拼音注 |

## 字体规范

- 主字「半卷」: **Source Han Serif SC SemiBold (600)** / 思源宋体 SemiBold
  - 备选: Songti SC / STSong / SimSun
- 拼音注「BAN·JUAN」: **JetBrains Mono Medium (500)**
  - 备选: SF Mono / Menlo

## 设计说明

字源采用商代甲骨文「册」字 —— 用皮绳串起长短不一的竹简，是中国最早的书籍形态。

- 五根竹简刻意长短不齐（22-82、22-76、14-84、20-78、18-80），符合甲骨文象形特征
- 两道横向朱砂编绳采用 Q 曲线模拟绳子绕过竹简的弧度
- 笔画粗细：竹简 3.8 / 编绳 3.6 / 单色版 3.4
- 配色策略：白底 + 墨竹 + 朱绳，对标 GoodNotes / Zotero / MarginNote 等同类阅读工具的行业惯例

## 导出 PNG 提示

如需 PNG 栅格图，推荐使用以下尺寸：
- macOS App: 1024 / 512 / 256 / 128 / 64 / 32 / 16
- iOS App: 1024 (App Store) / 180 / 167 / 152 / 120 / 87 / 80 / 76 / 60 / 58 / 40 / 29
- Web Favicon: 32 / 16

命令行导出示例（需安装 `librsvg`）：
```sh
rsvg-convert -w 1024 -h 1024 banjuan-icon-1024.svg -o banjuan-icon-1024.png
rsvg-convert -w 180 -h 180 banjuan-icon-1024.svg -o banjuan-icon-180.png
rsvg-convert -w 32 -h 32 banjuan-icon-1024.svg -o banjuan-icon-32.png
```
