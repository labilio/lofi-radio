const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
let createAudioWindowWebPreferences;
try {
  ({ createAudioWindowWebPreferences } = require('../../audio-window-config'));
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  app.whenReady().then(() => app.exit(1));
}

const projectRoot = path.resolve(__dirname, '..', '..');

async function run() {
  const preloadErrors = [];
  let resolveOutputSnapshot;
  const outputSnapshotPromise = new Promise((resolve, reject) => {
    resolveOutputSnapshot = resolve;
    setTimeout(() => reject(new Error('Timed out waiting for audio output snapshot')), 5000);
  });
  const window = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    webPreferences: {
      ...createAudioWindowWebPreferences(projectRoot),
      partition: `lofi-audio-preload-smoke-${process.pid}`
    }
  });

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    preloadErrors.push({ preloadPath, message: error.message });
  });
  ipcMain.on('audio-output-snapshot', (event, snapshot) => {
    if (event.sender === window.webContents) {
      resolveOutputSnapshot(snapshot);
    }
  });

  await window.loadFile(path.join(projectRoot, 'audio.html'));
  const pageState = await window.webContents.executeJavaScript(`
    ({
      runtime: {
        bridge: typeof window.audioPlayer,
        hls: typeof window.Hls,
        runtime: typeof window.LofiAudioRuntime
      },
      visibilityState: document.visibilityState
    })
  `);
  const outputSnapshot = await outputSnapshotPromise;
  window.destroy();
  return { preloadErrors, ...pageState, outputSnapshot };
}

if (createAudioWindowWebPreferences) app.whenReady()
  .then(run)
  .then((result) => {
    process.stdout.write(`AUDIO_PRELOAD_RESULT:${JSON.stringify(result)}\n`);
    app.quit();
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    app.exit(1);
  });
