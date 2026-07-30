const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');

function loadWindowShortcutPrevention() {
  try {
    return require('../window-shortcut-prevention');
  } catch {
    return {};
  }
}

test('window prevention blocks only destructive shortcuts and forwards recording input', () => {
  const { installWindowShortcutPrevention } = loadWindowShortcutPrevention();
  assert.equal(typeof installWindowShortcutPrevention, 'function');

  const webContents = new EventEmitter();
  const forwarded = [];
  installWindowShortcutPrevention(
    { webContents },
    input => forwarded.push(input),
    { platform: 'win32' }
  );

  const prevented = [];
  const inputs = [
    { type: 'keyDown', key: 'F5', expected: true },
    { type: 'keyDown', key: 'r', control: true, expected: true },
    { type: 'keyDown', key: 'R', control: true, shift: true, expected: true },
    { type: 'keyDown', key: 'r', meta: true, expected: false },
    { type: 'keyDown', key: 'w', control: true, expected: true },
    { type: 'keyDown', key: 'W', control: true, shift: true, expected: true },
    { type: 'keyDown', key: 'w', meta: true, expected: false },
    { type: 'keyDown', key: 'b', control: true, expected: false },
    { type: 'keyDown', key: 'r', control: true, alt: true, expected: false },
    { type: 'keyDown', key: 'w', control: true, alt: true, expected: false },
    { type: 'keyDown', key: 'w', alt: true, expected: false },
    { type: 'keyDown', key: 'F11', expected: false }
  ];

  for (const { expected, ...input } of inputs) {
    let wasPrevented = false;
    webContents.emit(
      'before-input-event',
      { preventDefault: () => { wasPrevented = true; } },
      input
    );
    prevented.push(wasPrevented);
  }

  assert.deepEqual(
    prevented,
    inputs.map(input => input.expected)
  );
  assert.deepEqual(
    forwarded,
    inputs
      .filter(input => input.expected)
      .map(({ expected, ...input }) => input)
  );
});

test('window prevention uses Command on macOS and Control elsewhere', () => {
  const {
    isPreventedWindowShortcut
  } = loadWindowShortcutPrevention();

  assert.equal(
    isPreventedWindowShortcut(
      { type: 'keyDown', key: 'r', meta: true },
      'darwin'
    ),
    true
  );
  assert.equal(
    isPreventedWindowShortcut(
      { type: 'keyDown', key: 'w', meta: true },
      'darwin'
    ),
    true
  );
  assert.equal(
    isPreventedWindowShortcut(
      { type: 'keyDown', key: 'w', control: true },
      'darwin'
    ),
    false
  );
  assert.equal(
    isPreventedWindowShortcut(
      { type: 'keyDown', key: 'w', control: true },
      'linux'
    ),
    true
  );
  assert.equal(
    isPreventedWindowShortcut(
      { type: 'keyDown', key: 'w', meta: true },
      'linux'
    ),
    false
  );
  assert.equal(
    isPreventedWindowShortcut(
      { type: 'keyDown', key: 'F5' },
      'darwin'
    ),
    true
  );
});

test('window prevention suppresses key-up without recording the shortcut twice', () => {
  const { installWindowShortcutPrevention } = loadWindowShortcutPrevention();
  const webContents = new EventEmitter();
  const forwarded = [];
  installWindowShortcutPrevention(
    { webContents },
    input => forwarded.push(input)
  );

  for (const type of ['keyDown', 'keyUp']) {
    let prevented = false;
    webContents.emit(
      'before-input-event',
      { preventDefault: () => { prevented = true; } },
      { type, key: 'r', control: true }
    );
    assert.equal(prevented, true);
  }

  assert.deepEqual(forwarded, [
    { type: 'keyDown', key: 'r', control: true }
  ]);
});

test('settings records protected shortcuts without reloading or closing the page', async () => {
  const electronPath = require('electron');
  const runner = path.join(
    __dirname,
    'fixtures',
    'electron-window-shortcut-recording-smoke.cjs'
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const result = await new Promise((resolve, reject) => {
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
        reject(new Error(`Refresh recording smoke failed (${code})\n${stdout}\n${stderr}`));
        return;
      }

      const line = stdout
        .split(/\r?\n/)
        .find(entry => entry.startsWith('REFRESH_RECORDING_RESULT:'));
      if (!line) {
        reject(new Error(`Refresh recording smoke returned no result\n${stdout}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(line.slice('REFRESH_RECORDING_RESULT:'.length)));
    });
  });

  assert.deepEqual(result, {
    refreshShortcutValue: 'Ctrl+R',
    closeShortcutValue: 'Ctrl+W',
    stillRecording: false,
    completedLoads: 1
  });
});
