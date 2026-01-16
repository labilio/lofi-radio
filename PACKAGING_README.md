# Lofi Radio Player - 打包独立版本

## 🚀 快速开始

### 方法1：便携版（推荐新手）

**适合场景：** 快速测试，免安装

```bash
# 运行打包脚本
package.bat

# 选择选项1 (便携版)
```

**结果：**
- 生成 `dist\lofi-radio-player-win32-x64\` 文件夹
- 双击 `lofi-radio-player.exe` 即可运行
- 无需安装，可直接在任何Windows电脑上运行

### 方法2：完整安装包

**适合场景：** 正式发布，需要安装程序

```bash
# 运行打包脚本
package.bat

# 选择选项2 (安装包)
```

**结果：**
- 生成 `release\` 文件夹
- 找到 `Lofi Radio Player Setup X.X.X.exe`
- 双击安装，会创建桌面快捷方式和开始菜单项

## 🔧 故障排除

### 错误："electron" is only allowed in "devDependencies"

**原因：** electron需要在开发依赖中
**解决：** 已修复，electron已在devDependencies中

### 错误：找不到electron.exe

**原因：** 构建过程中electron文件缺失
**解决：**
1. 删除node_modules：`rmdir /s /q node_modules`
2. 重新安装：`npm install`
3. 重试打包

### 构建很慢

**原因：** 首次构建需要下载electron (~100MB)
**解决：**
- 使用便携版打包（更快）
- 耐心等待，或去喝杯咖啡 ☕

## 📁 输出文件结构

```
便携版 (dist/lofi-radio-player-win32-x64/)
├── lofi-radio-player.exe    # 主程序
├── resources/               # 资源文件
└── ...其他文件

安装版 (release/)
├── Lofi Radio Player Setup X.X.X.exe  # 安装程序
└── ...其他构建文件
```

## 🎮 功能特性

打包后的独立版本包含所有功能：

- ✅ **隐形桌面播放器**
- ✅ **专注时长统计**
- ✅ **Mini胶囊模式**
- ✅ **全局快捷键**
- ✅ **现代化UI设计**

## 🎵 使用说明

**快捷键：**
- `Alt+Q` - 静音/取消静音
- `Alt+A` - 切换Mini模式
- 点击唱片 - 播放/暂停

**首次运行：**
1. 运行exe文件
2. 可能会弹出防火墙提示，允许即可
3. 享受你的lofi音乐！

---

**祝你打包顺利！🎉**