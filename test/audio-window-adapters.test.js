const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createAudioWindowAdapter,
  DirectAudioAdapter,
  HlsAudioAdapter,
  BilibiliAudioAdapter
} = require('../audio-window-adapters');

class FakeWebContents {
  constructor() {
    this.messages = [];
    this.muted = false;
  }

  send(channel, payload) {
    this.messages.push({ channel, payload });
  }

  setAudioMuted(muted) {
    this.muted = muted;
  }
}

class FakeWindow {
  constructor() {
    this.webContents = new FakeWebContents();
    this.loadedFiles = [];
    this.loadedUrls = [];
    this.sizes = [];
  }

  setSize(width, height) {
    this.sizes.push([width, height]);
  }

  loadFile(file) {
    this.loadedFiles.push(file);
    return Promise.resolve();
  }

  loadURL(url) {
    this.loadedUrls.push(url);
    return Promise.resolve();
  }

  isDestroyed() {
    return false;
  }
}

const directRequest = {
  station: { name: 'Direct', type: 'mp3', url: 'https://example.test/live' },
  stationIndex: 1,
  sessionId: 7
};

test('factory returns a dedicated adapter for every supported station type', () => {
  const window = new FakeWindow();

  assert.ok(createAudioWindowAdapter('mp3', { audioWindow: window }) instanceof DirectAudioAdapter);
  assert.ok(createAudioWindowAdapter('m3u8', { audioWindow: window }) instanceof HlsAudioAdapter);
  assert.ok(createAudioWindowAdapter('bilibili', { audioWindow: window }) instanceof BilibiliAudioAdapter);
});

test('direct adapter loads the local player and sends the complete session request', async () => {
  const window = new FakeWindow();
  const adapter = new DirectAudioAdapter({ audioWindow: window });

  await adapter.load(directRequest);

  assert.equal(path.basename(window.loadedFiles[0]), 'audio.html');
  assert.deepEqual(window.sizes[0], [1, 1]);
  assert.deepEqual(window.webContents.messages[0], {
    channel: 'audio-command-load',
    payload: directRequest
  });
});

test('HLS adapter preserves the m3u8 type in the local player request', async () => {
  const window = new FakeWindow();
  const adapter = new HlsAudioAdapter({ audioWindow: window });
  const request = {
    station: { name: 'HLS', type: 'm3u8', url: 'https://example.test/live.m3u8' },
    stationIndex: 2,
    sessionId: 8
  };

  await adapter.load(request);

  assert.deepEqual(window.webContents.messages[0], {
    channel: 'audio-command-load',
    payload: request
  });
});

test('adapter reapplies the saved volume after navigation creates a fresh page context', async () => {
  const window = new FakeWindow();
  const adapter = new DirectAudioAdapter({
    audioWindow: window,
    getVolume: () => 0.6
  });

  await adapter.load(directRequest);

  assert.deepEqual(window.webContents.messages[1], {
    channel: 'audio-command-volume',
    payload: 0.6
  });
});

test('Bilibili adapter loads the page before asking the preload to bind its video', async () => {
  const window = new FakeWindow();
  const adapter = new BilibiliAudioAdapter({
    audioWindow: window,
    getVolume: () => 0.7
  });
  const request = {
    station: { name: 'Live', type: 'bilibili', url: 'https://live.bilibili.com/123' },
    stationIndex: 0,
    sessionId: 9
  };

  await adapter.load(request);

  assert.deepEqual(window.loadedUrls, ['https://live.bilibili.com/123']);
  assert.deepEqual(window.sizes[0], [1200, 800]);
  assert.deepEqual(window.webContents.messages[0], {
    channel: 'audio-command-bilibili',
    payload: request
  });
  assert.deepEqual(window.webContents.messages[1], {
    channel: 'audio-command-volume',
    payload: 0.7
  });
});

test('adapter forwards only state events from its own active session', () => {
  const window = new FakeWindow();
  const adapter = new DirectAudioAdapter({ audioWindow: window });
  const received = [];
  adapter.onStateChange((event) => received.push(event));
  adapter.load(directRequest);

  adapter.handleState({ sessionId: 6, state: 'error', reason: 'network' });
  adapter.handleState({ sessionId: 7, state: 'playing' });

  assert.deepEqual(received, [{ state: 'playing', reason: undefined }]);
});

test('muting uses Electron audio muting and destroy cancels late load completion', async () => {
  let finishLoad;
  const window = new FakeWindow();
  window.loadFile = () => new Promise((resolve) => {
    finishLoad = resolve;
  });
  const adapter = new DirectAudioAdapter({ audioWindow: window });

  adapter.setMuted(true);
  const loading = adapter.load(directRequest);
  adapter.destroy();
  finishLoad();
  await loading;

  assert.equal(window.webContents.muted, true);
  assert.deepEqual(window.webContents.messages, [{
    channel: 'audio-command-destroy',
    payload: { sessionId: 7 }
  }]);
});
