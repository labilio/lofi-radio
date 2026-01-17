const { app, BrowserWindow, Tray, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 添加全局错误处理
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 禁用 Electron 的安全警告（仅用于开发）
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// 保持对窗口对象的全局引用，如果不这么做的话，当 JavaScript 对象被
// 垃圾回收时，window 对象将会自动的关闭
let mainWindow; // 桌面小部件窗口
let audioWindow; // 隐藏的音频窗口
let tray;

// 获取图标路径的辅助函数
function getIconPath() {
  const iconFormats = ['icon.ico', 'icon.png', 'icon-256.png', 'icon-128.png', 'icon-64.png', 'icon-32.png', 'icon-16.png'];
  
  for (const iconFile of iconFormats) {
    const iconPath = path.join(__dirname, iconFile);
    if (fs.existsSync(iconPath)) {
      console.log(`Using icon: ${iconFile}`);
      return iconPath;
    }
  }
  
  // 如果没有找到图标文件，返回null（使用默认图标）
  console.log('No icon file found, using default icon');
  return null;
}

// 设置应用程序音量的函数（通过控制视频元素的 volume）
function setApplicationVolume(volume) {
  // volume 范围: 0.0 - 1.0
  if (!audioWindow || audioWindow.isDestroyed()) {
    return;
  }

  // 通过 executeJavaScript 设置视频元素的 volume
  audioWindow.webContents.executeJavaScript(`
    (function() {
      const videos = document.querySelectorAll('video');
      if (videos.length === 0) {
        return { success: false, reason: 'no_videos' };
      }

      let setCount = 0;
      videos.forEach((video) => {
        try {
          video.volume = ${volume};
          setCount++;
        } catch (e) {
          console.error('Failed to set volume:', e);
        }
      });

      return { success: setCount > 0, count: setCount };
    })();
  `).then((result) => {
    if (result && result.success) {
      // 通知UI更新音量显示
      mainWindow.webContents.send('volume-changed', volume);
    } else {
      // 如果失败，使用轮询方式重试
      retrySetVolume(volume, 5);
    }
  }).catch(err => {
    console.error('Failed to set volume:', err);
    // 重试
    retrySetVolume(volume, 5);
  });
}

// 重试设置音量的函数
function retrySetVolume(volume, maxRetries) {
  let retries = 0;
  const retryInterval = setInterval(() => {
    retries++;

    if (!audioWindow || audioWindow.isDestroyed()) {
      clearInterval(retryInterval);
      return;
    }

    audioWindow.webContents.executeJavaScript(`
      const videos = document.querySelectorAll('video');
      if (videos.length > 0) {
        videos.forEach(video => {
          video.volume = ${volume};
        });
        return true;
      }
      return false;
    `).then((success) => {
      if (success) {
        clearInterval(retryInterval);
        mainWindow.webContents.send('volume-changed', volume);
      } else if (retries >= maxRetries) {
        clearInterval(retryInterval);
      }
    }).catch(err => {
      if (retries >= maxRetries) {
        clearInterval(retryInterval);
      }
    });
  }, 1000); // 每秒重试一次
}

function createWindow() {
  try {
    // 获取图标路径（优先使用.ico，如果没有则使用.png或.svg）
    const iconPath = getIconPath();

    // 创建浏览器窗口 - 桌面小部件样式
    mainWindow = new BrowserWindow({
      width: 300,
      height: 150,
      show: true, // 显示窗口（不再隐形）
      icon: iconPath, // 设置窗口图标（任务栏图标）
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false
      },
      // 桌面小部件配置
      frame: false, // 无边框
      transparent: true, // 开启透明模式
      backgroundColor: '#00000000', // 将背景色设置为完全透明
      alwaysOnTop: true, // 置顶显示
      skipTaskbar: false, // 显示在任务栏
      resizable: false, // 不可调整大小
      minimizable: false, // 不可最小化
      maximizable: false, // 不可最大化
      closable: true, // 可关闭
      // 禁用系统阴影，由前端CSS绘制圆角阴影
      hasShadow: false,
      // 圆角效果（在某些系统上可能仍然需要）
      roundedCorners: true
    });

    console.log('Widget window created successfully');
  } catch (e) {
    console.error('Failed to create widget window:', e);
    app.quit();
    return;
  }

  // 检查是否是测试模式
  const isTestMode = process.argv.includes('--test-rounded');

  // 加载对应的UI文件
  if (isTestMode) {
    // 检查是否有radius参数
    const radiusArg = process.argv.find(arg => arg.startsWith('--radius='));
    const radius = radiusArg ? radiusArg.split('=')[1] : '20px';

    mainWindow.loadFile('test-rounded-window.html');
    console.log(`Loading test rounded window with ${radius} radius...`);

    // 将radius值传递给渲染进程
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`window.testRadius = '${radius}';`);
    });
  } else {
    mainWindow.loadFile('index.html');
    console.log('Loading normal lofi radio widget...');
  }

  // 设置窗口位置到屏幕中央（确保可见）
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const windowWidth = 300;
  const windowHeight = 150;

  // 居中显示，确保可见
  const x = Math.floor((width - windowWidth) / 2);
  const y = Math.floor((height - windowHeight) / 2);
  mainWindow.setPosition(x, y);

  console.log(`Widget window positioned at: ${x}, ${y} (screen: ${width}x${height})`);

  // 监听来自UI的IPC消息
  const { ipcMain } = require('electron');

  ipcMain.on('toggle-play-pause', () => {
    // 系统级控制：使用Electron的音频静音API
    if (audioWindow && !audioWindow.isDestroyed()) {
      const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
      const shouldMute = !isCurrentlyMuted; // 切换静音状态

      audioWindow.webContents.setAudioMuted(shouldMute);
      console.log(`Audio: ${shouldMute ? 'MUTED' : 'UNMUTED'} via system API`);

      // 通知UI更新状态
      mainWindow.webContents.send('play-state-changed', !shouldMute);
    }
  });

  ipcMain.on('set-volume', (event, volume) => {
    // 使用新的音量控制函数
    setApplicationVolume(volume);
  });

  ipcMain.on('close-app', () => {
    app.quit();
  });

  // Mini模式切换
  ipcMain.on('toggle-mini-mode', () => {
    const [currentWidth, currentHeight] = mainWindow.getSize();

    if (currentWidth === 180 && currentHeight === 45) {
      // 当前是Mini模式，切换回普通模式
      mainWindow.setSize(300, 150);
      console.log('Switched to normal mode');
    } else {
      // 当前是普通模式，切换到Mini模式
      mainWindow.setSize(180, 45);
      console.log('Switched to mini mode');
    }
  });

  // 处理来自音频窗口的状态更新
  ipcMain.on('audio-play-state-changed', (event, isPlaying) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('play-state-changed', isPlaying);
    }
  });

  ipcMain.on('audio-volume-changed', (event, volume) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('volume-changed', volume);
    }
  });

  // 当窗口被关闭，这个事件会被触发
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建隐藏的音频窗口
function createAudioWindow() {
  try {
    // 获取图标路径
    const iconPath = getIconPath();

    audioWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false, // 完全隐藏
      icon: iconPath, // 设置窗口图标
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      skipTaskbar: true
    });

    // 加载 Bilibili 直播间
    audioWindow.loadURL('https://live.bilibili.com/27519423?live_from=84001&spm_id_from=333.337.0.0');

  // 当页面加载完成后，使用轮询方式等待B站视频加载
  audioWindow.webContents.on('did-finish-load', () => {
    console.log('Audio window: Page loaded, starting polling for video elements');

    // 使用setInterval轮询等待B站视频标签加载
    const pollInterval = setInterval(() => {
      audioWindow.webContents.executeJavaScript(`
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
          // 找到视频元素，取消静音并设置音量
          videos.forEach(video => {
            video.muted = false;
            video.volume = 0.3; // 默认30%音量
          });

          // 尝试自动播放
          videos[0].play().catch(e => {
            console.log('Auto-play failed, but video is ready');
          });

          console.log('Audio window: Video elements found and initialized');
          return true; // 成功找到视频
        }
        return false; // 还没找到视频
      `).then((found) => {
        if (found) {
          console.log('Audio window: Video initialization complete, clearing poll interval');
          clearInterval(pollInterval);
        }
      }).catch(err => {
        console.error('Audio window: Polling error:', err);
        clearInterval(pollInterval);
      });
    }, 1000); // 每秒检查一次

    // 30秒后停止轮询，避免无限运行
    setTimeout(() => {
      clearInterval(pollInterval);
      console.log('Audio window: Polling timeout after 30 seconds');
    }, 30000);
  });

  // 监听来自音频窗口的消息
  audioWindow.webContents.on('console-message', (event, level, message) => {
    if (message.includes('playStateChanged') || message.includes('volumeChanged')) {
      // 这里可以处理状态变化的通知
      console.log('Audio status:', message);
    }
  });

    console.log('Audio window created successfully');
  } catch (e) {
    console.error('Failed to create audio window:', e);
  }
}

// 创建系统托盘
function createTray() {
  try {
    // 获取图标路径
    const iconPath = getIconPath();
    
    if (iconPath) {
      tray = new Tray(iconPath);
      console.log(`Tray icon loaded from: ${iconPath}`);
    } else {
      // 如果没有图标文件，创建一个简单的默认图标
      console.log('Creating default tray icon');
      // 使用应用图标作为备用
      const defaultIcon = path.join(__dirname, 'icon.png');
      if (fs.existsSync(defaultIcon)) {
        tray = new Tray(defaultIcon);
      } else {
        // 最后的备用方案：使用空Buffer（会显示默认图标）
        tray = new Tray(Buffer.alloc(0));
        console.log('Using default system tray icon');
      }
    }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '静音/取消静音 (Alt+Q)',
      click: () => {
        if (audioWindow && !audioWindow.isDestroyed()) {
          const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
          audioWindow.webContents.setAudioMuted(!isCurrentlyMuted);
          mainWindow.webContents.send('play-state-changed', isCurrentlyMuted);
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

    tray.setToolTip('Lofi Radio Player - Alt+Q 播放/暂停');
    tray.setContextMenu(contextMenu);

    console.log('Tray created successfully');
  } catch (e) {
    console.log('Tray creation failed, continuing without tray:', e.message);
    // 如果托盘创建失败，继续运行应用（只是没有托盘功能）
  }
}

// 注册全局快捷键
function registerGlobalShortcut() {
  // 注册 Alt+Q 快捷键 - 系统级静音控制
  const success = globalShortcut.register('Alt+Q', () => {
    console.log('Alt+Q pressed - toggling mute state');
    if (audioWindow && !audioWindow.isDestroyed()) {
      const isCurrentlyMuted = audioWindow.webContents.isAudioMuted();
      audioWindow.webContents.setAudioMuted(!isCurrentlyMuted);
      console.log(`Global shortcut: Audio ${!isCurrentlyMuted ? 'MUTED' : 'UNMUTED'}`);

      // 通知UI更新状态
      mainWindow.webContents.send('play-state-changed', isCurrentlyMuted);
    }
  });

  if (success) {
    console.log('Global shortcut Alt+Q registered successfully');
  } else {
    console.log('Failed to register global shortcut Alt+Q');
  }
}

// Electron 会在初始化后并准备创建浏览器窗口时，调用这个函数
app.whenReady().then(() => {
  console.log('App is ready, creating windows...');
  createAudioWindow(); // 先创建音频窗口
  createWindow(); // 再创建UI窗口
  createTray();
  registerGlobalShortcut();

  app.on('activate', () => {
    // 在macOS上，当单击dock图标并且没有其他窗口打开时，
    // 通常在应用中重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createAudioWindow();
      createWindow();
    }
  });
}).catch((error) => {
  console.error('Failed to initialize app:', error);
  app.quit();
});

// 当全部窗口关闭时退出
app.on('window-all-closed', () => {
  // 在 macOS 上，除非用户用 Cmd + Q 确定地退出，
  // 否则绝大部分应用及其菜单栏会保持激活
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 在应用退出前取消注册快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});