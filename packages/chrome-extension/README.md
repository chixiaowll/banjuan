# 半卷闲书 网页剪藏（Chrome 扩展）

把网页正文或选中的内容保存到当前打开的半卷闲书书库，存为 `documents/web-clips/<日期>-<标题>/index.html`。

## 安装

1. 打开 `chrome://extensions`，打开右上角的「开发者模式」。
2. 点「加载已解压的扩展程序」，选择本目录 `packages/chrome-extension`。
3. 打开半卷闲书并打开一个书库，扩展会自动连接，不用填端口。

## 使用

- **工具栏按钮**：可选「正文」（自动提取文章，去掉导航、广告、脚本）或「选中内容」，可以加标签。
- **右键菜单**：「保存网页到半卷闲书」/「保存选中内容到半卷闲书」。保存结果显示在工具栏按钮的角标上（✓ 成功，! 失败，鼠标悬停看原因）。

网页里的图片会由应用下载并内嵌进 HTML，离线也能看。

## 连接方式

应用的本地接口优先监听 48720–48724 中第一个空闲的端口，扩展会依次探测这几个端口
（与 `packages/app/src/main/api-server.ts` 的 `API_PREFERRED_PORTS` 保持一致）。
如果这几个端口都被占用，应用会改用随机端口，这时在扩展的「设置」里填入
`~/.banjuan/api-port` 中的端口即可。

## 第三方代码

`vendor/Readability.js` 来自 [@mozilla/readability](https://github.com/mozilla/readability) 0.6.0，Apache License 2.0（见 `vendor/Readability-LICENSE.md`）。
