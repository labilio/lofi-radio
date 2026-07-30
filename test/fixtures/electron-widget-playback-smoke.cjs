const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const commands = [];

ipcMain.on('test-widget-command', (_event, command, value) => {
  commands.push({ command, value });
});

function wait(milliseconds = 40) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readState(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const widget = document.getElementById('widget');
      const volumeSlider = document.getElementById('volumeSlider');
      return {
        subtitle: document.querySelector('.subtitle')?.textContent,
        vinylPlaying: document.getElementById('playPauseBtn')?.classList.contains('playing'),
        vinylError: document.getElementById('playPauseBtn')?.classList.contains('playback-error'),
        stationButtonError: document.getElementById('stationListBtn')?.classList.contains('has-playback-error'),
        failedStations: document.querySelectorAll('.station-list-item.failed').length,
        stationPanelTitle: document.getElementById('stationPanelTitle')?.textContent.trim() || null,
        stationHealthButtonExists: Boolean(document.getElementById('stationHealthBtn')),
        stationHealthResultCount: document.querySelectorAll('.station-health-result').length,
        stationRows: Array.from(document.querySelectorAll('.station-list-item'), row => ({
          tagsVisible: getComputedStyle(row.querySelector('.station-tags')).display !== 'none'
        })),
        playTitle: document.getElementById('playPauseBtn')?.title,
        focusActive: window.focusTimeManager?.isPlaying,
        todayFocusDisplay: getComputedStyle(
          document.querySelector('.focus-time-display')
        ).display,
        todayFocusHiddenClass: widget.classList.contains('today-focus-hidden'),
        miniFocusContent: getComputedStyle(widget, '::before').content,
        volumeMin: volumeSlider?.min,
        volumeMax: volumeSlider?.max,
        volumeStep: volumeSlider?.step,
        hasOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth
          || document.documentElement.scrollHeight > document.documentElement.clientHeight,
        viewport: [
          document.documentElement.clientWidth,
          document.documentElement.clientHeight
        ]
      };
    })()
  `);
}

async function run() {
  const window = new BrowserWindow({
    width: 300,
    height: 150,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'widget-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: Boolean(process.env.SCREENSHOT_PATH),
      partition: `lofi-widget-smoke-${process.pid}`
    }
  });

  await window.loadFile(path.join(projectRoot, 'index.html'));
  await wait(250);
  const initial = await readState(window);

  const stations = [
    {
      name: 'Controlled MP3',
      type: 'mp3',
      url: 'https://example.test/live',
      style1: 'Lo-fi'
    },
    {
      name: 'Controlled HLS',
      type: 'm3u8',
      url: 'https://example.test/live.m3u8',
      style1: 'Classical'
    },
    {
      name: 'Controlled Live',
      type: 'bilibili',
      url: 'https://example.test/live-room',
      style1: 'Live'
    }
  ];
  window.webContents.send('test-stations-list', stations);
  window.webContents.send('test-station-changed', stations[0], 0);
  window.webContents.send('test-subtitle-changed', { mode: 'custom', customText: 'Deep Focus' });
  window.webContents.send('test-playback-status', {
    sessionId: 1,
    stationIndex: 0,
    state: 'connecting',
    reason: null,
    retryCount: 0
  });
  await wait();
  const connecting = await readState(window);

  await window.webContents.executeJavaScript(
    `document.getElementById('stationListBtn').click()`
  );
  await wait(process.env.SCREENSHOT_PATH ? 400 : 40);
  if (process.env.SCREENSHOT_PATH) {
    const screenshot = await window.webContents.capturePage();
    fs.writeFileSync(process.env.SCREENSHOT_PATH, screenshot.toPNG());
  }
  await window.webContents.executeJavaScript(
    `document.querySelector('.station-list-item[data-index="1"]').click()`
  );
  await wait();

  window.webContents.send('test-playback-status', {
    sessionId: 1,
    stationIndex: 0,
    state: 'playing',
    reason: null,
    retryCount: 0
  });
  await wait();
  const playing = await readState(window);

  window.webContents.send('test-show-today-focus-changed', false);
  await wait();
  const todayFocusHidden = await readState(window);

  await window.webContents.executeJavaScript(
    `document.getElementById('widget').classList.add('mini-mode')`
  );
  await wait();
  const todayFocusHiddenMini = await readState(window);

  await window.webContents.executeJavaScript(
    `document.getElementById('widget').classList.remove('mini-mode')`
  );
  window.webContents.send('test-show-today-focus-changed', true);
  await wait();
  const todayFocusShown = await readState(window);

  await window.webContents.executeJavaScript(
    `document.getElementById('widget').classList.add('mini-mode')`
  );
  window.webContents.send('test-playback-status', {
    sessionId: 1,
    stationIndex: 0,
    state: 'error',
    reason: 'network',
    retryCount: 1
  });
  await wait();
  const error = await readState(window);

  await window.webContents.executeJavaScript(
    `document.getElementById('playPauseBtn').click()`
  );
  await wait();

  window.destroy();
  return {
    initial,
    connecting,
    playing,
    todayFocusHidden,
    todayFocusHiddenMini,
    todayFocusShown,
    error,
    commands
  };
}

app.whenReady()
  .then(run)
  .then((result) => {
    process.stdout.write(`WIDGET_RESULT:${JSON.stringify(result)}\n`);
    app.quit();
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    app.exit(1);
  });
