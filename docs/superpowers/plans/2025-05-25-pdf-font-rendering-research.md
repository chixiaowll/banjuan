# PDF 字体渲染问题调研

## 问题描述

部分 PDF（特别是数学教材）在渲染时文字显示乱码，出现多余的 `=` 号和字符偏移。

## 当前实现分析

当前 `PdfPage.tsx` 的渲染方式比较特殊：

1. **禁用 canvas 文字渲染**：通过 `ctx.fillText = () => {}` 拦截所有 canvas 文字绘制
2. **白色矩形覆盖**：在 canvas 上的文字区域绘制白色矩形（lines 234-272），彻底清除 canvas 文字
3. **依赖 text layer 显示文字**：用 PDF.js 的 TextLayer（HTML `<span>` 覆盖层）作为唯一的文字显示来源

**这不是业界标准做法。** 标准做法是 canvas 渲染所有视觉内容（包括文字），text layer 仅作为透明覆盖层提供文本选择和搜索功能。

## 业界方案对比

| 方案 | 文字渲染方式 | text layer 用途 |
|------|------------|----------------|
| **Firefox (PDF.js)** | canvas 上直接渲染文字 | 透明层，仅用于选择/搜索 |
| **Zotero Reader** | canvas 上直接渲染文字 | 透明层，仅用于选择 |
| **我们当前** | 禁用 canvas 文字 + 白色覆盖 | 可见层，作为唯一文字来源 |

## 根因分析

### 问题一：toUnicode 映射错误

PDF.js 的 `getTextContent()` 返回的 Unicode 文本对于某些自定义编码字体是错误的。这导致 text layer 显示乱码（多余的 `=`、`"` 替代 `-` 等）。这是 PDF.js 的已知限制。

### 问题二：Chromium Type1 字体 bug（关键！）

Chromium 131+ 的新 Fontations 引擎**不支持 Type1 字体**（PDF.js issue #20143）。当 PDF.js 用 `@font-face` 加载 Type1 字体后调用 `ctx.fillText()`，Chromium 无法正确渲染。

- **受影响版本**：Chrome 131 ~ 141（对应 Electron 33~38）
- **已修复版本**：Chrome M142（对应 Electron ~39+）
- **我们的 Electron 35（Chromium ~134）正好在受影响范围内**

这解释了为什么启用 canvas fillText 后文字也是乱的。

### 问题三：Path 渲染偏移

使用 `disableFontFace: true` 强制 path 渲染时，字符有 -31 的偏移（如 "SYSTEMS" → "4:45&.4"）。这可能是 Zotero fork 或 PDF.js 的 font 处理 bug，在分配 `fontChar` 时引入了偏移。

## 可行方案

### 方案 A：标准化渲染模式（推荐）

恢复业界标准的双层渲染：
1. 让 canvas 正常渲染所有内容（包括文字）
2. text layer 设为透明，仅用于文本选择
3. 删除 fillText 拦截和白色矩形覆盖代码

**风险**：Chromium Type1 bug 可能导致部分字体渲染异常。需要测试。
**缓解**：PDF.js 内部有 fallback 机制，当 @font-face 加载失败时会自动切换到 path 渲染。

### 方案 B：升级 Electron

升级到 Electron 39+（Chromium 142+）可以从根本上解决 Type1 字体问题。但 Electron 39 可能尚未发布。

### 方案 C：使用 MuPDF.js（WASM）

用 MuPDF 的 WebAssembly 版本替代 PDF.js 的 canvas 渲染。MuPDF 有自己的字体引擎，不依赖浏览器字体 API，不受 Chromium bug 影响。

- 优点：渲染质量最好，与 macOS Preview 一致
- 缺点：AGPL 许可证（商业使用需购买许可）；需要较大的架构改动

### 方案 D：混合方案

对于 Type1 字体问题，可以在 PDF.js 的 `font_loader.js` 中检测 Type1 字体，主动设置 `disableFontFace = true`。同时需要修复 path 渲染的 -31 偏移问题。

## 参考资料

- [PDF.js #20143](https://github.com/mozilla/pdf.js/issues/20143) — Chromium Fontations 不支持 Type1
- [PDF.js #14117](https://github.com/mozilla/pdf.js/issues/14117) — /Encoding 阻止字符渲染
- [PDF.js #9941](https://github.com/mozilla/pdf.js/issues/9941) — Unicode 字体字符错误
- [PDF.js #8229](https://github.com/mozilla/pdf.js/issues/8229) — 复制时文字乱码
- [Chromium Fontations 调试](https://blog.seokho.dev/development/2025/08/27/debugging-note-pdfjs-fonts.html)

## 结论

当前最优先的修改是**方案 A：回归标准渲染模式**。删除 fillText 拦截和白色矩形覆盖，让 canvas 正常渲染文字，text layer 仅作为透明选择层。即使因为 Chromium Type1 bug 导致某些字体在 canvas 上渲染异常，PDF.js 的 fallback 机制可能会自动切换到 path 渲染。最终的彻底解决需要等 Electron 升级到 Chromium 142+。
