const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 配置文件路径
const configPath = path.join(app.getPath('userData'), 'config.json');

// 保存配置
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// 加载配置
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return { lastStationIndex: 0 };
}


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

// 设置应用程序音量的函数
function setApplicationVolume(volume) {
  if (!audioWindow || audioWindow.isDestroyed()) {
    return;
  }
  audioWindow.webContents.send('audio-command-volume', volume);
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
    if (audioWindow && !audioWindow.isDestroyed()) {
      if (isPlaying) {
        audioWindow.webContents.send('audio-command-pause');
      } else {
        audioWindow.webContents.send('audio-command-play');
      }
    }
  });

  ipcMain.on('set-volume', (event, volume) => {
    // 使用新的音量控制函数
    setApplicationVolume(volume);
  });
  
  ipcMain.on('get-stations', (event) => {
    event.reply('stations-list', stations);
    if (stations.length > 0) {
      event.reply('station-changed', stations[currentStationIndex], currentStationIndex);
    }
  });

  ipcMain.on('change-station', (event, index) => {
    playStation(index);
  });
  
  ipcMain.on('prev-station', () => {
    let newIndex = currentStationIndex - 1;
    if (newIndex < 0) newIndex = stations.length - 1;
    playStation(newIndex);
  });
  
  ipcMain.on('next-station', () => {
    let newIndex = currentStationIndex + 1;
    if (newIndex >= stations.length) newIndex = 0;
    playStation(newIndex);
  });
  
  ipcMain.on('random-station', () => {
    if (stations.length > 1) {
      let newIndex = currentStationIndex;
      while (newIndex === currentStationIndex) {
        newIndex = Math.floor(Math.random() * stations.length);
      }
      playStation(newIndex);
    }
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
  ipcMain.on('audio-state-update', (event, state) => {
    if (state.playing !== undefined) {
      isPlaying = state.playing;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('play-state-changed', isPlaying);
      }
    }
  });
  
  ipcMain.on('audio-error', (event, error) => {
    console.error('Audio Error:', error);
  });

  // 当窗口被关闭，这个事件会被触发
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建隐藏的音频窗口
function createAudioWindow() {
  try {
    const iconPath = getIconPath();
    audioWindow = new BrowserWindow({
      width: 400,
      height: 300,
      show: false, // 隐藏
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      skipTaskbar: true
    });

    audioWindow.loadFile('audio.html');

    audioWindow.webContents.on('did-finish-load', () => {
      console.log('Audio window loaded');
      // Load initial station
      loadStations();
    });

    console.log('Audio window created successfully');
  } catch (e) {
    console.error('Failed to create audio window:', e);
  }
}

let stations = [];
let currentStationIndex = 0;
let isPlaying = false;

function loadStations() {
  try {
    const stationsPath = path.join(__dirname, 'stations.json');
    if (fs.existsSync(stationsPath)) {
      const data = fs.readFileSync(stationsPath, 'utf8');
      stations = JSON.parse(data);
      console.log(`Loaded ${stations.length} stations`);
      
      // Load user config
      const config = loadConfig();
      let startIndex = config.lastStationIndex || 0;
      
      // Validate index
      if (startIndex < 0 || startIndex >= stations.length) {
        startIndex = 0;
      }

      // Load default station
      if (stations.length > 0) {
        playStation(startIndex);
      }
    } else {
      console.error('stations.json not found');
    }
  } catch (e) {
    console.error('Failed to load stations:', e);
  }
}

function playStation(index) {
  if (index >= 0 && index < stations.length) {
    currentStationIndex = index;
    const station = stations[index];
    
    // Save to config
    saveConfig({ lastStationIndex: currentStationIndex });

    if (audioWindow && !audioWindow.isDestroyed()) {
      console.log(`Playing station: ${station.name}`);
      audioWindow.webContents.send('audio-command-station', station.url);
      
      // Notify UI
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('station-changed', station, currentStationIndex);
      }
    }
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
      label: '播放/暂停 (Alt+Q)',
      click: () => {
        if (audioWindow && !audioWindow.isDestroyed()) {
          if (isPlaying) {
            audioWindow.webContents.send('audio-command-pause');
          } else {
            audioWindow.webContents.send('audio-command-play');
          }
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
    console.log('Alt+Q pressed - toggling play/pause state');
    if (audioWindow && !audioWindow.isDestroyed()) {
      if (isPlaying) {
        audioWindow.webContents.send('audio-command-pause');
      } else {
        audioWindow.webContents.send('audio-command-play');
      }
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