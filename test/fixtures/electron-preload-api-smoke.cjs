const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let showTodayFocus = true;

ipcMain.handle('get-show-today-focus', () => showTodayFocus);
ipcMain.handle('set-show-today-focus', (_event, enabled) => {
  showTodayFocus = Boolean(enabled);
  return showTodayFocus;
});

function wait(milliseconds = 30) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function inspectPreload() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: `lofi-preload-smoke-${process.pid}`
    }
  });

  await window.loadURL('data:text/html,<main>preload smoke</main>');

  const values = await window.webContents.executeJavaScript(`
    (async () => {
      const initial = await window.lofiWidget.getShowTodayFocus();
      const saved = await window.settingsAPI.setShowTodayFocus(false);
      const settingsRead = await window.settingsAPI.getShowTodayFocus();
      return { initial, saved, settingsRead };
    })()
  `);

  const changedPromise = window.webContents.executeJavaScript(`
    new Promise(resolve => {
      window.lofiWidget.onShowTodayFocusChanged(resolve);
    })
  `);
  await wait();
  window.webContents.send('show-today-focus-changed', true);
  const changed = await changedPromise;

  window.destroy();
  return { ...values, changed };
}

app.whenReady()
  .then(inspectPreload)
  .then(result => {
    process.stdout.write(`PRELOAD_RESULT:${JSON.stringify(result)}\n`);
    app.quit();
  })
  .catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    app.exit(1);
  });

