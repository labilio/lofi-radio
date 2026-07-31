const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'main.js'),
  'utf8'
);

test('main process keeps media-key handling disabled to avoid headset pause deadlock', () => {
  assert.match(
    mainSource,
    /disable-features['"],\s*['"]HardwareMediaKeyHandling,MediaSessionService['"]/
  );
});

test('main process starts and disposes controlled audio output monitoring', () => {
  assert.match(
    mainSource,
    /require\(['"]\.\/audio-output-monitor['"]\)/
  );
  assert.match(
    mainSource,
    /startAudioOutputMonitoring\(\{[\s\S]*?getAudioWindow:\s*\(\)\s*=>\s*audioWindow[\s\S]*?getPlaybackState:\s*\(\)\s*=>\s*playbackStatus\.state[\s\S]*?getPlaybackController:\s*\(\)\s*=>\s*playbackController[\s\S]*?\}\)/
  );
  assert.match(
    mainSource,
    /app\.on\(['"]will-quit['"],[\s\S]*?disposeAudioOutputMonitoring\(\)/
  );
});
