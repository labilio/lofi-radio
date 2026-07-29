const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function inspectPreload() {
  return new Promise((resolve, reject) => {
    const electronPath = require('electron');
    const runner = path.join(__dirname, 'fixtures', 'electron-preload-api-smoke.cjs');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronPath, [runner], {
      cwd: path.resolve(__dirname, '..'),
      env,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`Preload smoke failed (${code})\n${stdout}\n${stderr}`));
        return;
      }

      const line = stdout
        .split(/\r?\n/)
        .find(entry => entry.startsWith('PRELOAD_RESULT:'));
      if (!line) {
        reject(new Error(`Preload smoke returned no result\n${stdout}\n${stderr}`));
        return;
      }

      resolve(JSON.parse(line.slice('PRELOAD_RESULT:'.length)));
    });
  });
}

function inspectWidgetPreload() {
  return new Promise((resolve, reject) => {
    const electronPath = require('electron');
    const runner = path.join(__dirname, 'fixtures', 'electron-widget-preload-smoke.cjs');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronPath, [runner], {
      cwd: path.resolve(__dirname, '..'),
      env,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`Widget preload smoke failed (${code})\n${stdout}\n${stderr}`));
        return;
      }

      const line = stdout
        .split(/\r?\n/)
        .find(entry => entry.startsWith('WIDGET_PRELOAD_RESULT:'));
      if (!line) {
        reject(new Error(`Widget preload smoke returned no result\n${stdout}\n${stderr}`));
        return;
      }

      resolve(JSON.parse(line.slice('WIDGET_PRELOAD_RESULT:'.length)));
    });
  });
}

test('preload exposes the Today Focus preference to settings and widget windows', async () => {
  const result = await inspectPreload();

  assert.equal(result.initial, true);
  assert.equal(result.saved, false);
  assert.equal(result.settingsRead, false);
  assert.equal(result.changed, true);
});

test('preload omits batch station health while preserving normal playback APIs', async () => {
  const result = await inspectWidgetPreload();

  assert.deepEqual(result.preloadErrors, []);
  assert.deepEqual(result.api, {
    healthStart: 'undefined',
    healthCancel: 'undefined',
    healthUpdate: 'undefined',
    getStations: 'function',
    changeStation: 'function',
    playbackUpdate: 'function'
  });
});
