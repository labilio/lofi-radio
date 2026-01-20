# Lofi Radio Player - macOS 版本发布说明

项目现在支持 macOS 系统。

## 新增内容

### 1. macOS 图标
- 创建了 `icon.icns` 文件（包含所有必需尺寸）
- 支持高分辨率 Retina 显示屏

### 2. macOS 构建配置
在 `package.json` 中添加了 macOS 专属配置：
- 目标格式：DMG 磁盘映像、ZIP 压缩包
- 应用分类：音乐类应用
- 硬化运行时：增强安全性
- 权限配置：`build/entitlements.mac.plist`

### 3. 新增构建脚本
```bash
# 构建 macOS 应用
npm run build:mac

# 构建所有平台（Windows + macOS）
npm run build:all

# 打包 macOS 分发版本
npm run dist:mac

# 使用 electron-packager 打包
npm run pack:mac
```

## 构建产物

构建完成后，在 `dist_green/` 目录下会生成：
- `Lofi Radio Player-1.0.2-arm64.dmg` (111 MB) - macOS 安装包
- `Lofi Radio Player-1.0.2-arm64-mac.zip` (106 MB) - macOS 压缩包
- `mac-arm64/Lofi Radio Player.app` - macOS 应用程序


## 注意事项

### 关于代码签名
当前应用未进行 Apple 代码签名，这意味着：
- ⚠️ 首次打开时可能需要右键点击 → "打开"，或在系统设置中允许
- ⚠️ 可能被 macOS Gatekeeper 警告
- ✅ 不影响功能使用

### 如果需要代码签名
需要申请 Apple Developer 账号（$99/年）：
1. 在 Apple Developer 后台创建证书
2. 配置 `CSC_LINK` 和 `CSC_KEY_PASSWORD` 环境变量
3. 重新构建应用

### 架构支持
当前构建为 ARM64 架构（Apple Silicon M1/M2/M3/M4）。如需支持 Intel Mac：
```bash
# 构建 Universal 版本（同时支持 ARM64 和 x64）
npm run build:mac -- --mac --universal
```

## 测试结果
✅ 应用在 macOS 上成功启动并运行
✅ 窗口显示正常
✅ 所有进程正常运行


## 文件变更清单

### 新增文件
- `icon.icns` - macOS 应用图标
- `build/entitlements.mac.plist` - macOS 权限配置文件
- `MAC_RELEASE_NOTES.md` - 本文档

### 修改文件
- `package.json` - 添加 macOS 构建配置和脚本

## 开发和调试

### 开发模式运行
```bash
npm run dev
```

### 构建特定平台
```bash
# 仅构建 Windows
npm run build

# 仅构建 macOS
npm run build:mac

# 构建所有平台
npm run build:all
```

## 技术栈
- Electron 40.0.0
- Node.js
- HTML5/CSS3/JavaScript
- macOS 原生图标格式 (.icns)
- electron-builder 24.13.3
