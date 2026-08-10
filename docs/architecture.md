# 项目结构

Lofi Radio 按 Electron 的进程边界组织代码。这样可以直接从目录判断一段代码运行在哪个安全上下文中，也能避免主进程、preload 和页面脚本继续堆在仓库根目录。

```text
src/
├─ main/       Electron 主进程：生命周期、窗口、系统能力和服务
├─ preload/    各 BrowserWindow 的最小权限桥接层
├─ renderer/   HTML、CSS 和页面脚本，按窗口聚合
└─ shared/     确实需要跨进程复用的纯 JavaScript 模块

resources/     运行时数据与图标
build/         electron-builder 使用的构建资源
scripts/       开发和诊断脚本
test/          Node 与 Electron 回归测试
```

## 目录职责

### `src/main`

应用入口是 `src/main/index.js`。这里只有 Electron 主进程可以使用的能力，例如 `app`、`BrowserWindow`、托盘、全局快捷键、自动更新和本地配置。

- `audio/`：隐藏音频窗口及其适配器
- `playback/`：播放状态编排
- `services/`：启动项和更新服务
- `windows/`：窗口尺寸、显示和快捷键保护

### `src/preload`

preload 使用 `contextBridge` 暴露页面真正需要的 IPC 接口。页面脚本不能直接依赖 Node.js 或 Electron 主进程模块。

### `src/renderer`

每个窗口拥有自己的目录，HTML、样式和页面脚本放在一起：

- `widget/`：主播放器窗口
- `audio/`：本地音频播放页
- `settings/`：设置窗口
- `history/`：专注历史窗口
- `update/`：更新可用、已是最新和错误状态
- `shared/`：多个页面共用的样式和 Web Awesome 入口

### `src/shared`

这里只放无需 Electron 主进程权限、并且确实被多个进程使用的模块。新增代码默认应放进具体进程目录，不能因为暂时不知道归属就放到 `shared`。

### `resources`

`resources/stations.json` 是运行时电台目录，`resources/icons` 同时供应用窗口、托盘和打包配置使用。它们通过 electron-builder 的 `files` 白名单进入 ASAR。

## 新增文件放在哪里

Electron 官方规定的是进程边界，而不是唯一的文件夹名称。本仓库把这些边界固定成上述目录约定；面向编码代理的强制规则记录在根目录 `AGENTS.md`。

新增文件时按以下顺序判断：

1. 代码运行在 main、preload，还是某个 renderer 页面？先放进对应的进程或页面目录。
2. 文件是否只服务一个页面？如果是，HTML、CSS 和页面脚本继续放在该页面目录中。
3. 文件是否已经被多个页面或进程实际复用？只有满足这一条件，且不依赖 Electron 特权 API，才进入 `src/renderer/shared` 或 `src/shared`。
4. 它是运行时资源、构建资源、开发脚本、测试材料还是文档图片？分别进入 `resources`、`build`、`scripts`、`test` 或 `docs/assets`。
5. 无法判断时先追踪调用者和数据流，不新建 `utils`、`misc`、`common` 等兜底目录，也不把文件放回仓库根目录。

仓库根目录只保留项目入口与治理文件和一级目录；运行时 JavaScript、HTML、CSS、数据、图标、截图、测试产物和临时脚本不得散落在根目录。

## 数据流

```text
renderer page → preload API → IPC → main process/service
main process → IPC event → preload API → renderer page
main process → hidden audio window → media adapter
```

## 路径和打包规则

- 主进程从项目根路径派生 renderer、preload 和 resources 的绝对路径。
- HTML 内的页面资源使用相对路径，不能依赖当前工作目录。
- `package.json#build.files` 只包含 `src/**/*`、`resources/**/*`、`package.json` 和 `LICENSE`。
- 测试、文档、截图、构建结果和本地工具目录不能进入 `app.asar`。
- 移动运行时文件后必须运行 `npm test`；修改打包路径后还必须运行 `npm run dist` 和 packaged ASAR 审计。

参考：[Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) 和 [electron-builder Application Contents](https://www.electron.build/docs/contents/)。
