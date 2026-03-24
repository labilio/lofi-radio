# Lofi Radio Player 核心逻辑文档

## 一、架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        main.js (主进程)                          │
│  - 管理窗口生命周期                                               │
│  - 维护播放状态 (isPlaying)                                       │
│  - 处理 IPC 通信                                                  │
│  - 禁用硬件媒体按键                                                │
└─────────────────────────────────────────────────────────────────┘
         │                                        │
         │ IPC                                    │ IPC
         ▼                                        ▼
┌─────────────────────┐              ┌─────────────────────┐
│   mainWindow        │              │   audioWindow       │
│   (UI 窗口)          │              │   (隐藏音频窗口)      │
│   - 300x150 普通     │              │   - show: false     │
│   - 180x45 Mini     │              │   - 加载音频源        │
│   - 用户交互界面      │              │   - Bilibili 页面    │
│                     │              │   - audio.html      │
│   index.html        │              │                     │
│   widget.js         │              │                     │
│   preload.js        │              │   preload.js        │
└─────────────────────┘              └─────────────────────┘
```

---

## 二、核心设计决策

### 2.1 播放控制：Mute/Unmute 而非 Play/Pause

**为什么用静音而不是暂停？**

```javascript
// ✅ 正确方式：使用 Mute/Unmute
audioWindow.webContents.setAudioMuted(shouldMute);
isPlaying = !shouldMute;

// ❌ 错误方式：不要用 Play/Pause
// audioWindow.webContents.executeJavaScript('video.pause()');
```

**原因：**
1. **Bilibili 视频特性**：如果真正暂停视频，再恢复播放可能触发自动播放策略失败
2. **状态同步简单**：Mute 只是静音，视频继续播放，不会产生状态混乱
3. **响应速度快**：不需要等待视频加载/缓冲

**重要：** `isPlaying` 变量的含义是"是否有声音输出"，而不是"视频是否在播放"。

---

### 2.2 禁用硬件媒体按键

```javascript
// main.js 启动时
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
```

**原因：**
- 蓝牙耳机摘下/敲击会发送媒体控制信号
- 键盘多媒体按键会干扰播放状态
- 确保只有 UI 按钮能控制播放

**效果：** 应用对系统媒体控制信号"装聋作哑"。

---

### 2.3 双窗口架构

| 窗口 | 用途 | 可见性 | 内容 |
|------|------|--------|------|
| mainWindow | 用户交互界面 | 可见 | index.html |
| audioWindow | 音频播放 | 隐藏 | Bilibili 页面 或 audio.html |

**为什么用双窗口？**
1. **Bilibili 需要**：Bilibili 直播流需要在网页中播放，不能直接用 `<audio>` 标签
2. **隔离关注点**：UI 和音频逻辑分离，互不干扰
3. **性能优化**：audioWindow 隐藏，不占用渲染资源

---

## 三、状态管理

### 3.1 核心状态变量（main.js）

```javascript
let isPlaying = false;           // 是否有声音输出（非静音状态）
let currentStationIndex = 0;     // 当前电台索引
let currentStationType = 'bilibili';  // 当前电台类型
let stations = [];               // 电台列表
```

### 3.2 状态流转

```
用户点击播放按钮
       │
       ▼
widget.js: togglePlayPause()
       │
       ▼
IPC: 'toggle-play-pause'
       │
       ▼
main.js: 处理 IPC
       │
       ├── 获取当前静音状态: audioWindow.webContents.isAudioMuted()
       │
       ├── 切换静音状态: audioWindow.webContents.setAudioMuted(!isMuted)
       │
       ├── 更新 isPlaying 变量
       │
       ▼
IPC: 'play-state-changed' → mainWindow
       │
       ▼
widget.js: onPlayStateChange 回调
       │
       ▼
更新 UI（按钮状态、唱片动画）
```

### 3.3 状态同步原则

**单一数据源：** `isPlaying` 状态只在 `main.js` 中维护，UI 通过 IPC 接收状态更新。

```javascript
// ✅ 正确：状态由 main.js 推送
mainWindow.webContents.send('play-state-changed', isPlaying);

// ❌ 错误：不要在 UI 层独立维护状态
// this.isPlaying = !this.isPlaying;  // 仅用于即时 UI 反馈
```

---

## 四、IPC 通信协议

### 4.1 UI → 主进程

| 通道 | 参数 | 说明 |
|------|------|------|
| `toggle-play-pause` | 无 | 切换播放/暂停 |
| `set-volume` | volume (0-1) | 设置音量 |
| `change-station` | index | 切换电台 |
| `get-stations` | 无 | 获取电台列表 |
| `toggle-mini-mode` | 无 | 切换 Mini 模式 |
| `close-app` | 无 | 关闭应用 |

### 4.2 主进程 → UI

| 通道 | 参数 | 说明 |
|------|------|------|
| `play-state-changed` | isPlaying (boolean) | 播放状态变化 |
| `volume-changed` | volume (0-1) | 音量变化 |
| `station-changed` | station, index | 电台变化 |
| `stations-list` | stations[] | 电台列表 |

### 4.3 主进程 → audioWindow

| 通道 | 参数 | 说明 |
|------|------|------|
| `audio-command-volume` | volume (0-1) | 设置音量（非 Bilibili） |
| `audio-command-station` | url, type | 加载电台（非 Bilibili） |

---

## 五、音频源处理

### 5.1 两种音频源类型

```javascript
// stations.json 示例
[
  {
    "name": "Lofi Girl",
    "url": "https://www.bilibili.com/xxx",
    "type": "bilibili"
  },
  {
    "name": "Chillhop",
    "url": "https://stream.example.com/playlist.m3u8",
    "type": "m3u8"
  },
  {
    "name": "Radio",
    "url": "https://stream.example.com/radio.mp3",
    "type": "mp3"
  }
]
```

### 5.2 Bilibili 音频处理

```javascript
// main.js: playStation()
if (currentStationType === 'bilibili') {
  audioWindow.loadURL(station.url).then(() => {
    initBilibiliAudio();  // 轮询查找 video 元素
  });
}

// initBilibiliAudio(): 轮询初始化
audioWindow.webContents.executeJavaScript(`
  const videos = document.querySelectorAll('video');
  if (videos.length > 0) {
    videos.forEach(video => {
      video.muted = false;
      video.volume = 0.3;
    });
    videos[0].play();
    return true;
  }
`);
```

**注意：** Bilibili 页面需要轮询查找 `<video>` 元素，因为页面加载是异步的。

### 5.3 流媒体音频处理（mp3/m3u8）

```javascript
// main.js: playStation()
audioWindow.loadFile('audio.html').then(() => {
  audioWindow.webContents.send('audio-command-station', station.url, station.type);
});

// audio.html: 处理流媒体
if (type === 'm3u8') {
  hls = new Hls();
  hls.loadSource(url);
  hls.attachMedia(player);
} else {
  player.src = url;
  player.play();
}
```

---

## 六、音量控制

### 6.1 Bilibili 音量

```javascript
// 直接操作 video 元素
audioWindow.webContents.executeJavaScript(`
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    video.volume = ${volume};
  });
`);
```

### 6.2 流媒体音量

```javascript
// 通过 IPC 发送到 audio.html
audioWindow.webContents.send('audio-command-volume', volume);

// audio.html
player.volume = volume;
```

---

## 七、全局快捷键

```javascript
// main.js
const shortcutKey = isMac ? 'Option+Q' : 'Alt+Q';
globalShortcut.register(shortcutKey, () => {
  // 与 UI 按钮相同的逻辑
  const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
  audioWindow.webContents.setAudioMuted(!isCurrentlyMuted);
  isPlaying = isCurrentlyMuted;
  mainWindow.webContents.send('play-state-changed', isCurrentlyMuted);
});
```

**注意：** 全局快捷键和 UI 按钮使用相同的播放控制逻辑。

---

## 八、常见错误与注意事项

### 8.1 ❌ 不要做的事

1. **不要在 audioWindow 中处理播放/暂停逻辑**
   - audioWindow 只负责加载音频源
   - 播放控制通过 Mute/Unmute 实现

2. **不要监听系统的媒体控制事件**
   - 已禁用 HardwareMediaKeyHandling
   - 应用不接受外部媒体控制

3. **不要在 UI 层独立判断播放状态**
   - 播放状态由 main.js 维护
   - UI 只响应 IPC 推送的状态更新

4. **不要真正暂停 Bilibili 视频**
   - 使用 Mute/Unmute
   - 避免触发自动播放策略

### 8.2 ✅ 正确的做法

1. **修改播放逻辑时，只改 main.js 中的 `toggle-play-pause` 处理**
2. **添加新音频源时，在 `playStation()` 中添加类型判断**
3. **状态同步通过 IPC，不要绕过 IPC 直接通信**
4. **保持 audioWindow 隐藏，不要 show**

---

## 九、文件职责清单

| 文件 | 职责 | 修改频率 |
|------|------|----------|
| `main.js` | 主进程逻辑、窗口管理、IPC 处理、播放控制 | 高 |
| `preload.js` | IPC API 暴露、安全桥接 | 低 |
| `widget.js` | UI 交互、状态显示、用户输入处理 | 中 |
| `index.html` | UI 布局、样式 | 低 |
| `audio.html` | 流媒体播放器（mp3/m3u8） | 低 |
| `stations.json` | 电台配置 | 低 |

---

## 十、调试技巧

### 10.1 查看 IPC 通信

```javascript
// main.js 中添加日志
ipcMain.on('toggle-play-pause', () => {
  console.log('[IPC] toggle-play-pause received');
  console.log(`[State] isPlaying: ${isPlaying}, isMuted: ${audioWindow.webContents.isAudioMuted()}`);
});
```

### 10.2 查看 audioWindow 状态

```javascript
// 开发时临时显示 audioWindow
audioWindow.show();
audioWindow.webContents.openDevTools();
```

### 10.3 检查硬件媒体按键是否禁用

```javascript
// 在 app.whenReady() 后添加
console.log('Hardware media key handling disabled');
```
