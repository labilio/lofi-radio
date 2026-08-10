# AGENTS.md

## 项目概览

Lofi Radio Player 是一个 Electron 桌面应用。Electron 官方定义的是 main、renderer、preload 等进程职责，并没有规定唯一的目录树；本仓库据此固定了一套目录约定。完整结构说明见 `docs/architecture.md`。

后续新增、移动或重命名文件时，必须先判断代码运行在哪个 Electron 进程，再决定目录。不要把运行时代码、页面资源或临时文件堆到仓库根目录。

## 目录归属

- `src/main/`：应用生命周期、`BrowserWindow`、托盘、快捷键、原生系统 API、IPC 处理和主进程服务。
- `src/preload/`：preload 入口和通过 `contextBridge` 暴露的最小 IPC 接口。不要在这里实现页面业务或主进程服务。
- `src/renderer/<page>/`：某个窗口的 HTML、CSS 和页面脚本；同一页面的文件放在一起。目前页面包括 `widget`、`audio`、`settings`、`history` 和 `update`。
- `src/renderer/shared/`：至少被两个 renderer 页面复用的页面层资源。
- `src/shared/`：至少被两个进程上下文复用、且不依赖 Electron 特权 API 的纯 JavaScript 模块。它不是无法判断归属时的兜底目录。
- `resources/`：应用运行时需要随包分发的数据和图标。
- `build/`：仅供 electron-builder、签名或安装包使用的构建资源；不要放应用运行时文件。
- `scripts/`：开发、诊断和维护脚本。
- `test/`：自动化测试、测试辅助模块和 fixtures。
- `docs/`：面向贡献者的文档；截图等文档资源放在 `docs/assets/`。

仓库根目录只保留项目入口和治理文件，例如 `AGENTS.md`、`README.md`、`LICENSE`、`package.json`、`package-lock.json`、Git 配置文件，以及上述一级目录。不要在根目录新增运行时 `.js`、`.html`、`.css`、数据文件、图标、截图、测试产物或临时脚本。

## 新增文件决策顺序

1. 先确认它运行在 main、preload 还是某个 renderer 页面。
2. 只服务一个进程或页面时，放在该进程或页面目录中。
3. 只有实际被多个页面复用时才放 `src/renderer/shared/`；只有实际跨进程复用且保持纯 JavaScript 时才放 `src/shared/`。
4. 运行时资源放 `resources/`，构建专用资源放 `build/`，工具放 `scripts/`，测试材料放 `test/`，文档资源放 `docs/assets/`。
5. 如果仍不能判断归属，先检查调用者和数据流，不要先创建 `utils`、`misc`、`common` 或新的根目录。

## 路径和打包改动

移动运行时文件时，要同步检查并更新：

- CommonJS `require` 路径；
- `BrowserWindow.loadFile` 和 `webPreferences.preload` 路径；
- HTML 中脚本、样式和图片的相对路径；
- `package.json#main` 与 `build.files` 白名单；
- 测试中的路径断言和辅助函数；
- `README.md` 与 `docs/architecture.md` 中的结构说明。

纯目录整理应尽量与行为重构分开，除非路径调整必须伴随小范围代码改动。

## 开发和验证

- 安装依赖：`npm install`
- 启动开发版：`npm run dev`
- 运行测试：`npm test`
- 生成 Windows 安装包：`npm run dist`

移动普通源码后至少运行 `npm test` 和 `git diff --check`。修改入口、preload、renderer、resources 或打包白名单后，还必须运行：

```powershell
npm run dist
$env:RUN_PACKAGED_CONTENT_AUDIT=1; node --test test/packaged-content.test.js
$env:RUN_PACKAGED_SUBPAGE_INTEGRATION=1; node --test test/packaged-subpages.test.js
```

不要提交 `dist_green/`、测试输出、基准结果、日志、缓存或临时目录。临时验证文件必须放进已忽略的专用目录，并在完成后清理。
