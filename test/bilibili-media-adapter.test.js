const test = require('node:test');
const assert = require('node:assert/strict');

const { BilibiliMediaAdapter } = require('../bilibili-media-adapter');

class FakeScheduler {
  constructor() {
    this.callback = null;
    this.cleared = false;
  }

  setInterval(callback) {
    this.callback = callback;
    return 1;
  }

  clearInterval() {
    this.cleared = true;
    this.callback = null;
  }

  tick() {
    this.callback?.();
  }
}

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.volume = 1;
    this.muted = false;
    this.paused = true;
    this.readyState = 0;
    this.error = null;
    this.playCalls = 0;
  }

  play() {
    this.playCalls += 1;
    return Promise.resolve();
  }
}

test('Bilibili waits for dynamically inserted videos and binds playback states', () => {
  const videos = [];
  const document = {
    querySelectorAll: () => videos
  };
  const scheduler = new FakeScheduler();
  const states = [];
  const adapter = new BilibiliMediaAdapter({ document, scheduler });
  adapter.onStateChange((state) => states.push(state));

  adapter.load();
  const video = new FakeVideo();
  videos.push(video);
  scheduler.tick();

  video.dispatchEvent(new Event('playing'));
  video.dispatchEvent(new Event('waiting'));

  assert.equal(video.playCalls, 1);
  assert.deepEqual(states, [
    { state: 'playing' },
    { state: 'buffering' }
  ]);
});

test('Bilibili applies volume to current and later videos', () => {
  const first = new FakeVideo();
  const videos = [first];
  const scheduler = new FakeScheduler();
  const adapter = new BilibiliMediaAdapter({
    document: { querySelectorAll: () => videos },
    scheduler
  });

  adapter.setVolume(0.4);
  adapter.load();
  assert.equal(first.volume, 0.4);

  const second = new FakeVideo();
  videos.push(second);
  scheduler.tick();
  assert.equal(second.volume, 0.4);
});

test('Bilibili normalizes media failures and removes listeners when destroyed', () => {
  const video = new FakeVideo();
  const scheduler = new FakeScheduler();
  const states = [];
  const adapter = new BilibiliMediaAdapter({
    document: { querySelectorAll: () => [video] },
    scheduler
  });
  adapter.onStateChange((state) => states.push(state));
  adapter.load();

  video.error = { code: 2 };
  video.dispatchEvent(new Event('error'));
  adapter.destroy();
  video.dispatchEvent(new Event('playing'));

  assert.deepEqual(states, [{ state: 'error', reason: 'network' }]);
  assert.equal(scheduler.cleared, true);
});
