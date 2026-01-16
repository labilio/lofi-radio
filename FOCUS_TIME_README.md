# 今日专注时长统计功能

## 功能概述

新增的"今日专注时长"统计功能，能够自动记录用户播放音乐时的专注时间，帮助用户了解每日专注时长。

## 功能特性

### 🎯 核心功能
- **智能计时**：仅在播放状态下累积时长
- **数据持久化**：使用 localStorage 保存数据，关闭重启后继续累积
- **自动重置**：每天 0 点自动清零，支持跨天统计
- **实时显示**：界面实时更新专注时长

### 📊 数据存储
```javascript
// localStorage 数据结构
{
  "focusTime": 45,        // 专注时长（分钟）
  "lastDate": "2024-01-16" // 最后更新日期
}
```

## UI 设计

### 显示位置
- 位于唱片机和音量控制区域下方
- 居中显示，不抢占视觉焦点

### 样式特点
- **字体大小**：12px
- **颜色**：半透明米白色 (opacity: 0.6)
- **文字**：Today Focus: 45 min
- **数字强调**：专注时长数字略微高亮

## 技术实现

### 核心逻辑 (renderer.js)

#### FocusTimeManager 类
```javascript
class FocusTimeManager {
  constructor() {
    this.focusTime = 0;     // 专注时长（分钟）
    this.isPlaying = true;  // 播放状态
    this.timer = null;      // 计时器
    this.lastDate = null;   // 最后日期
  }
}
```

#### 关键方法
- `loadFromStorage()` - 从 localStorage 加载数据
- `saveToStorage()` - 保存数据到 localStorage
- `checkDateReset()` - 检查是否需要重置（新的一天）
- `startTimer()` / `stopTimer()` - 开始/停止计时
- `updateDisplay()` - 更新界面显示

### 计时机制
- **计时频率**：每分钟累积 1 分钟
- **触发条件**：仅在 `isPlaying = true` 时计时
- **数据保存**：每分钟自动保存到 localStorage

### 日期重置逻辑
- **检查时机**：程序启动时 + 每分钟检查一次
- **重置条件**：当前日期与存储日期不同
- **重置操作**：时长归零，更新日期

## 文件修改

### index.html
```html
<!-- 今日专注时长 -->
<div class="focus-time-display">
    Today Focus: <span id="focusTime">0</span> min
</div>
```

### styles.css
```css
.focus-time-display {
    text-align: center;
    margin-top: 16px;
    font-size: 12px;
    color: rgba(248, 250, 252, 0.6);
    pointer-events: none;
}
```

### renderer.js
- 新增专注时长管理器
- 实现数据持久化和计时逻辑

## 使用说明

### 正常使用
1. 启动应用程序后，专注时长自动开始累积（如果正在播放）
2. 点击唱片切换播放/暂停状态，时长相应累积或暂停
3. 界面实时显示当前专注时长

### 数据持久化
- 关闭应用程序后再次打开，时长会继续累积
- 每天 0 点自动重置为 0

### 调试功能
```javascript
// 在浏览器控制台中可以访问
window.focusTimeManager.getFocusTime();  // 获取当前时长
window.focusTimeManager.resetFocusTime(); // 重置时长（仅用于测试）
```

## 注意事项

### 性能考虑
- 计时器使用 `setInterval`，频率为每分钟一次
- 数据保存频率为每分钟一次，减少 I/O 操作

### 边界情况处理
- **跨天运行**：程序运行期间跨天时自动重置
- **异常退出**：使用 `beforeunload` 事件确保数据保存
- **数据损坏**：JSON 解析失败时使用默认值

### 兼容性
- **浏览器支持**：依赖 localStorage 和 setInterval
- **时区处理**：使用本地时区判断日期

## 故障排除

### 时长不累积
1. 检查播放状态是否为 true
2. 检查浏览器控制台是否有错误信息
3. 确认 localStorage 是否可用

### 日期不重置
1. 检查系统时间是否正确
2. 确认日期格式是否正确 (YYYY-MM-DD)

### 显示异常
1. 检查 CSS 样式是否正确加载
2. 确认 HTML 元素 ID 是否正确