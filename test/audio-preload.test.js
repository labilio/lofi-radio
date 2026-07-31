const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('hidden audio window loads its local preload modules and browser bridge', async () => {
  const electronPath = require('electron');
  const runner = path.join(__dirname, 'fixtures', 'electron-audio-preload-smoke.cjs');
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
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Audio preload smoke failed (${code})\n${stdout}\n${stderr}`));
        return;
      }
      const line = stdout.split(/\r?\n/)
        .find((entry) => entry.startsWith('AUDIO_PRELOAD_RESULT:'));
      if (!line) {
        reject(new Error(`Audio preload smoke returned no result\n${stdout}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(line.slice('AUDIO_PRELOAD_RESULT:'.length)));
    });
  });

  assert.deepEqual(result.preloadErrors, []);
  assert.deepEqual(result.runtime, {
    bridge: 'object',
    hls: 'function',
    runtime: 'object'
  });
  assert.equal(result.visibilityState, 'visible');
  assert.equal(typeof result.outputSnapshot.contextId, 'string');
  assert.ok(result.outputSnapshot.contextId.length > 0);
  assert.deepEqual(
    Object.keys(result.outputSnapshot.defaultOutput).sort(),
    ['groupId', 'label']
  );
  assert.equal(Array.isArray(result.outputSnapshot.outputDeviceIds), true);
});
