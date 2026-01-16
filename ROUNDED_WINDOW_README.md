# 圆角窗口效果实现说明

## 概述

本项目已经实现了真正的圆角窗口效果，解决了 Windows 上系统阴影显示为直角的问题。通过禁用系统阴影并使用前端 CSS 自定义绘制圆角阴影。

## 主要修改

### 1. Electron 主进程配置 (main.js)

```javascript
// 禁用系统阴影，由前端CSS绘制圆角阴影
hasShadow: false,
// 圆角效果（在某些系统上可能仍然需要）
roundedCorners: true
```

### 2. 前端 CSS 增强 (styles.css)

```css
/* 增强的自定义阴影 - 替代系统阴影 */
box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12),
    0 32px 64px rgba(0, 0, 0, 0.4),
    0 16px 32px rgba(0, 0, 0, 0.3),
    0 8px 16px rgba(0, 0, 0, 0.2),
    0 0 80px rgba(59, 130, 246, 0.12),
    0 0 120px rgba(30, 42, 59, 0.15);
```

### 3. 窗口拖拽支持

- 整个窗口区域设置为 `-webkit-app-region: drag`
- 按钮区域设置为 `-webkit-app-region: no-drag`
- 确保交互元素可以正常点击

## 测试方法

运行 `run.bat` 并选择相应的选项来测试不同弧度的圆角窗口效果：

```
Select mode:
1. Normal Lofi Radio Widget
2. Test Rounded Window Effect (20px radius)
3. Test Rounded Window Effect (16px radius)
4. Test Rounded Window Effect (24px radius)
```

**推荐弧度：**
- 16px：更紧凑现代的圆角
- 20px：平衡美观性和实用性（当前默认）
- 24px：更大胆的圆角效果

## 兼容性

- ✅ Windows 10/11：完美圆角，无直角阴影
- ✅ macOS：原生圆角支持
- ✅ Linux：根据桌面环境支持情况

## 技术要点

1. **无边框窗口**：`frame: false`
2. **透明背景**：`transparent: true`
3. **禁用系统阴影**：`hasShadow: false`
4. **统一圆角设计**：所有四个角使用相同的弧度值，确保视觉一致性
5. **自定义 CSS 阴影**：通过多层 box-shadow 创建圆角阴影效果
6. **动态弧度测试**：支持运行时切换不同的圆角弧度进行比较
7. **跨平台兼容**：使用 `-webkit-` 前缀确保 WebKit 兼容性

## 文件清单

- `main.js` - Electron 主进程（已修改）
- `styles.css` - 样式文件（已增强）
- `preload.js` - 预加载脚本（已添加通用 API）
- `test-rounded-window.html` - 圆角窗口测试页面
- `run.bat` - 启动脚本（已添加测试选项）

## 注意事项

- 确保系统支持透明窗口
- 在某些 Linux 桌面环境下可能需要额外配置
- CSS 阴影效果会消耗更多 GPU 资源，建议在性能不足的设备上适当减少阴影层数