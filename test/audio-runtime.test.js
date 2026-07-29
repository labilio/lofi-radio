const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DirectMediaAdapter,
  HlsMediaAdapter,
  mapMediaError
} = require('../audio-runtime');

class FakeMedia extends EventTarget {
  constructor() {
    super();
    this.src = '';
    this.volume = 1;
    this.muted = false;
    this.error = null;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.loadCalls = 0;
    this.nativeHls = false;
  }

  play() {
    this.playCalls += 1;
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
  }

  load() {
    this.loadCalls += 1;
  }

  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }

  canPlayType(type) {
    return type === 'application/vnd.apple.mpegurl' && this.nativeHls ? 'probably' : '';
  }
}

class FakeHls {
  static Events = {
    MANIFEST_PARSED: 'manifest',
    ERROR: 'error'
  };

  static ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError'
  };

  static isSupported() {
    return true;
  }

  constructor() {
    this.handlers = new Map();
    this.destroyed = false;
    FakeHls.instances.push(this);
  }

  on(event, listener) {
    this.handlers.set(event, listener);
  }

  emit(event, data) {
    this.handlers.get(event)?.(event, data);
  }

  loadSource(url) {
    this.url = url;
  }

  attachMedia(media) {
    this.media = media;
  }

  destroy() {
    this.destroyed = true;
  }
}

FakeHls.instances = [];

test('direct media reports real playing and buffering events', async () => {
  const media = new FakeMedia();
  const states = [];
  const adapter = new DirectMediaAdapter({
    media,
    onStateChange: (state) => states.push(state)
  });

  await adapter.load({ url: 'https://example.test/live' });
  media.dispatchEvent(new Event('playing'));
  media.dispatchEvent(new Event('waiting'));
  media.dispatchEvent(new Event('stalled'));

  assert.equal(media.src, 'https://example.test/live');
  assert.equal(media.playCalls, 1);
  assert.deepEqual(states, [
    { state: 'playing' },
    { state: 'buffering' },
    { state: 'buffering' }
  ]);
});

test('media error codes become stable controller reasons', () => {
  assert.equal(mapMediaError({ code: 2 }), 'network');
  assert.equal(mapMediaError({ code: 3 }), 'media');
  assert.equal(mapMediaError({ code: 4 }), 'unsupported');
  assert.equal(mapMediaError(null), 'media');
});

test('direct media reports a normalized error and stops emitting after destroy', async () => {
  const media = new FakeMedia();
  const states = [];
  const adapter = new DirectMediaAdapter({
    media,
    onStateChange: (state) => states.push(state)
  });

  await adapter.load({ url: 'https://example.test/live' });
  media.error = { code: 2 };
  media.dispatchEvent(new Event('error'));
  adapter.destroy();
  media.dispatchEvent(new Event('playing'));

  assert.deepEqual(states, [{ state: 'error', reason: 'network' }]);
  assert.equal(media.pauseCalls, 1);
  assert.equal(media.src, '');
});

test('HLS starts playback after its manifest and reports fatal failures without looping internally', async () => {
  FakeHls.instances = [];
  const media = new FakeMedia();
  const states = [];
  const adapter = new HlsMediaAdapter({
    media,
    HlsClass: FakeHls,
    onStateChange: (state) => states.push(state)
  });

  await adapter.load({ url: 'https://example.test/live.m3u8' });
  const hls = FakeHls.instances[0];
  hls.emit(FakeHls.Events.MANIFEST_PARSED);
  await Promise.resolve();
  hls.emit(FakeHls.Events.ERROR, {
    fatal: false,
    type: FakeHls.ErrorTypes.NETWORK_ERROR
  });
  hls.emit(FakeHls.Events.ERROR, {
    fatal: true,
    type: FakeHls.ErrorTypes.NETWORK_ERROR
  });

  assert.equal(hls.url, 'https://example.test/live.m3u8');
  assert.equal(hls.media, media);
  assert.equal(media.playCalls, 1);
  assert.deepEqual(states, [{ state: 'error', reason: 'network' }]);
});

test('HLS falls back to native playback when the browser supports it', async () => {
  class UnsupportedHls extends FakeHls {
    static isSupported() {
      return false;
    }
  }

  const media = new FakeMedia();
  media.nativeHls = true;
  const adapter = new HlsMediaAdapter({
    media,
    HlsClass: UnsupportedHls,
    onStateChange: () => {}
  });

  await adapter.load({ url: 'https://example.test/native.m3u8' });

  assert.equal(media.src, 'https://example.test/native.m3u8');
  assert.equal(media.playCalls, 1);
});
