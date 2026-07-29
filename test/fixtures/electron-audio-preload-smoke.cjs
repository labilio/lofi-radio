const { app, BrowserWindow } = require('electron');
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

  await window.loadFile(path.join(projectRoot, 'audio.html'));
  const runtime = await window.webContents.executeJavaScript(`
    ({
      bridge: typeof window.audioPlayer,
      hls: typeof window.Hls,
      runtime: typeof window.LofiAudioRuntime
    })
  `);
  window.destroy();
  return { preloadErrors, runtime };
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
