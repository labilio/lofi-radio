const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function inspectWidget() {
  return new Promise((resolve, reject) => {
    const electronPath = require('electron');
    const runner = path.join(__dirname, 'fixtures', 'electron-widget-playback-smoke.cjs');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronPath, [runner], {
      cwd: path.resolve(__dirname, '..'),
      env,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Widget smoke failed (${code})\n${stdout}\n${stderr}`));
        return;
      }
      const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith('WIDGET_RESULT:'));
      if (!line) {
        reject(new Error(`Widget smoke returned no result\n${stdout}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(line.slice('WIDGET_RESULT:'.length)));
    });
  });
}

test('widget restores the persisted greeting mode when it starts', async () => {
  const result = await inspectWidget();
  const greetings = [
    'Hello, night owl',
    'Rise and shine',
    'Morning, sunshine',
    'Enjoy the midday calm',
    'A peaceful afternoon',
    'What a beautiful evening',
    'Good evening, dreamer'
  ];

  assert.ok(
    greetings.includes(result.initial.subtitle),
    `expected a persisted greeting, received "${result.initial.subtitle}"`
  );
});

test('widget reflects real playback state without changing its compact layout', async () => {
  const result = await inspectWidget();

  assert.equal(result.connecting.subtitle, '正在连接…');
  assert.equal(result.connecting.vinylPlaying, false);
  assert.equal(result.connecting.focusActive, false);
  assert.equal(result.connecting.hasOverflow, false);
  assert.ok(result.connecting.viewport[0] <= 301);
  assert.ok(result.connecting.viewport[1] <= 151);

  assert.equal(result.playing.subtitle, 'Deep Focus');
  assert.equal(result.playing.vinylPlaying, true);
  assert.equal(result.playing.focusActive, true);

  assert.equal(result.error.subtitle, '连接失败 · 点击唱片重试');
  assert.equal(result.error.vinylPlaying, false);
  assert.equal(result.error.vinylError, true);
  assert.equal(result.error.stationButtonError, true);
  assert.equal(result.error.failedStations, 1);
  assert.equal(result.error.playTitle, '连接失败，点击重试');
  assert.equal(result.error.focusActive, false);
  assert.equal(result.error.hasOverflow, false);
  assert.ok(result.commands.some(({ command }) => command === 'retry'));
});

test('station list stays focused on music tags and direct station selection', async () => {
  const result = await inspectWidget();

  assert.equal(result.connecting.stationPanelTitle, '选择电台');
  assert.equal(result.connecting.stationHealthButtonExists, false);
  assert.equal(result.connecting.stationHealthResultCount, 0);
  assert.ok(result.connecting.stationRows.every(row => row.tagsVisible));
  assert.ok(result.commands.some(({ command }) => command === 'station'));
});

test('volume slider offers one-percent adjustment across the full media range', async () => {
  const result = await inspectWidget();

  assert.equal(result.connecting.volumeMin, '0');
  assert.equal(result.connecting.volumeMax, '1');
  assert.equal(result.connecting.volumeStep, '0.01');
});

test('widget hides Today Focus only in normal mode when the preference is disabled', async () => {
  const result = await inspectWidget();

  assert.equal(result.todayFocusHidden.todayFocusDisplay, 'none');
  assert.equal(result.todayFocusHidden.todayFocusHiddenClass, true);
  assert.match(result.todayFocusHiddenMini.miniFocusContent, /Focus: 0 min/);
  assert.equal(result.todayFocusHiddenMini.focusActive, true);
  assert.equal(result.todayFocusShown.todayFocusHiddenClass, false);
  assert.notEqual(result.todayFocusShown.todayFocusDisplay, 'none');
});
