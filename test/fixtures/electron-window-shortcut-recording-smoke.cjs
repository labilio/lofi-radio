const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const {
  installWindowShortcutPrevention
} = require('../../window-shortcut-prevention');

ipcMain.on('get-shortcuts', event => {
  event.reply('shortcuts-data', {
    playPause: 'Alt+Q',
    toggleWindow: 'Alt+W'
  });
});
ipcMain.on('get-subtitle-config', event => {
  event.reply('subtitle-config-data', {
    mode: 'date',
    customText: ''
  });
});
ipcMain.on('set-settings-height', () => {});
ipcMain.handle('get-launch-at-startup', () => ({ enabled: false }));
ipcMain.handle('get-show-today-focus', () => true);

function wait(milliseconds = 50) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function inspectWindowShortcutRecording() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: `lofi-refresh-recording-${process.pid}`
    }
  });

  let completedLoads = 0;
  window.webContents.on('did-finish-load', () => {
    completedLoads += 1;
  });
  installWindowShortcutPrevention(window, input => {
    window.webContents.send('prevented-window-shortcut-input', {
      key: String(input.key || ''),
      ctrlKey: Boolean(input.control),
      altKey: Boolean(input.alt),
      shiftKey: Boolean(input.shift),
      metaKey: Boolean(input.meta)
    });
  });

  await window.loadFile(path.resolve(__dirname, '..', '..', 'settings.html'));
  await window.webContents.executeJavaScript(`
    Promise.all([
      customElements.whenDefined('wa-button'),
      customElements.whenDefined('wa-input')
    ]).then(() => true)
  `);
  await wait();

  await window.webContents.executeJavaScript(`
    document.getElementById('playPauseShortcut').click()
  `);
  window.webContents.focus();
  window.webContents.sendInputEvent({
    type: 'keyDown',
    keyCode: 'R',
    modifiers: ['control']
  });
  window.webContents.sendInputEvent({
    type: 'keyUp',
    keyCode: 'R',
    modifiers: ['control']
  });
  await wait();
  const refreshShortcutValue = await window.webContents.executeJavaScript(`
    document.getElementById('playPauseShortcut').value
  `);

  await window.webContents.executeJavaScript(`
    document.getElementById('playPauseShortcut').click()
  `);
  window.webContents.sendInputEvent({
    type: 'keyDown',
    keyCode: 'W',
    modifiers: ['control']
  });
  window.webContents.sendInputEvent({
    type: 'keyUp',
    keyCode: 'W',
    modifiers: ['control']
  });
  await wait();

  const result = await window.webContents.executeJavaScript(`
    ({
      closeShortcutValue: document.getElementById('playPauseShortcut').value,
      stillRecording:
        document.getElementById('playPauseShortcut').classList.contains('recording')
    })
  `);

  window.destroy();
  return {
    ...result,
    refreshShortcutValue,
    completedLoads
  };
}

app.whenReady()
  .then(inspectWindowShortcutRecording)
  .then(result => {
    process.stdout.write(`REFRESH_RECORDING_RESULT:${JSON.stringify(result)}\n`);
    app.quit();
  })
  .catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    app.exit(1);
  });
