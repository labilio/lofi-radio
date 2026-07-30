const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');

async function run() {
  const preloadErrors = [];
  const window = new BrowserWindow({
    width: 100,
    height: 100,
    show: false,
    webPreferences: {
      preload: path.join(projectRoot, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: `lofi-widget-preload-smoke-${process.pid}`
    }
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    preloadErrors.push({ preloadPath, message: error.message });
  });

  await window.loadURL('data:text/html,<main>preload smoke</main>');
  const api = await window.webContents.executeJavaScript(`({
    healthStart: typeof window.lofiWidget?.startStationHealthCheck,
    healthCancel: typeof window.lofiWidget?.cancelStationHealthCheck,
    healthUpdate: typeof window.lofiWidget?.onStationHealthCheckUpdate,
    getStations: typeof window.lofiWidget?.getStations,
    changeStation: typeof window.lofiWidget?.changeStation,
    playbackUpdate: typeof window.lofiWidget?.onPlaybackStatusChange,
    getSubtitleConfig: typeof window.lofiWidget?.getSubtitleConfig
  })`);
  window.destroy();
  return { preloadErrors, api };
}

app.whenReady()
  .then(run)
  .then(result => {
    process.stdout.write(`WIDGET_PRELOAD_RESULT:${JSON.stringify(result)}\n`);
    app.quit();
  })
  .catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    app.exit(1);
  });
