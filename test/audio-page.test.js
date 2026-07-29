const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectElectronPage } = require('./electron-test-utils');

test('audio player loads all playback runtime code locally', async () => {
  const result = await inspectElectronPage('audio.html');

  assert.deepEqual(result.externalResources, []);
  assert.deepEqual(result.pageErrors, []);
});
