const test = require('node:test');
const assert = require('node:assert/strict');

const { PlaybackController } = require('../playback-controller');

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delay, callback });
    return id;
  }

  clearTimeout(id) {
    this.tasks.delete(id);
  }

  advance(milliseconds) {
    const target = this.now + milliseconds;

    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];

      if (!next) break;

      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.at;
      task.callback();
    }

    this.now = target;
  }
}

class FakeAdapter {
  constructor(type) {
    this.type = type;
    this.destroyed = false;
    this.muted = false;
    this.loads = [];
    this.listener = () => {};
  }

  onStateChange(listener) {
    this.listener = listener;
  }

  load(request) {
    this.loads.push(request);
  }

  setMuted(muted) {
    this.muted = muted;
  }

  destroy() {
    this.destroyed = true;
  }

  emit(event) {
    this.listener(event);
  }
}

function createHarness() {
  const clock = new FakeClock();
  const adapters = [];
  const states = [];
  const controller = new PlaybackController({
    createAdapter(type) {
      const adapter = new FakeAdapter(type);
      adapters.push(adapter);
      return adapter;
    },
    onStateChange(payload) {
      states.push(payload);
    },
    scheduler: clock
  });

  return { controller, clock, adapters, states };
}

function lastState(harness) {
  return harness.states.at(-1);
}

test('direct streams retry once after a 12 second connection timeout', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'Direct', type: 'mp3', url: 'https://example.test/live' }, 2);
  assert.equal(lastState(harness).state, 'connecting');

  harness.clock.advance(12000);

  assert.equal(harness.adapters.length, 2);
  assert.equal(harness.adapters[0].destroyed, true);
  assert.equal(lastState(harness).state, 'reconnecting');
  assert.equal(lastState(harness).reason, 'connect-timeout');
  assert.equal(lastState(harness).retryCount, 1);

  harness.clock.advance(12000);

  assert.equal(harness.adapters.length, 2);
  assert.equal(lastState(harness).state, 'error');
  assert.equal(lastState(harness).reason, 'connect-timeout');
});

test('Bilibili uses a 20 second connection timeout', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'Bilibili', type: 'bilibili', url: 'https://live.bilibili.com/1' }, 0);
  harness.clock.advance(19999);
  assert.equal(lastState(harness).state, 'connecting');

  harness.clock.advance(1);
  assert.equal(lastState(harness).state, 'reconnecting');
});

test('short buffering recovers without rebuilding the source', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'Direct', type: 'mp3', url: 'https://example.test/live' }, 0);
  harness.adapters[0].emit({ state: 'playing' });
  harness.adapters[0].emit({ state: 'buffering' });
  harness.clock.advance(7999);
  harness.adapters[0].emit({ state: 'playing' });
  harness.clock.advance(1);

  assert.equal(harness.adapters.length, 1);
  assert.equal(lastState(harness).state, 'playing');
});

test('eight seconds of continuous buffering rebuilds the current source once', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'HLS', type: 'm3u8', url: 'https://example.test/live.m3u8' }, 3);
  harness.adapters[0].emit({ state: 'playing' });
  harness.adapters[0].emit({ state: 'buffering' });
  harness.clock.advance(8000);

  assert.equal(harness.adapters.length, 2);
  assert.equal(lastState(harness).state, 'reconnecting');
  assert.equal(lastState(harness).reason, 'stall-timeout');
  assert.equal(lastState(harness).stationIndex, 3);
});

test('manual retry resets the automatic retry budget after an error', () => {
  const harness = createHarness();
  const station = { name: 'Direct', type: 'mp3', url: 'https://example.test/live' };

  harness.controller.load(station, 0);
  harness.adapters[0].emit({ state: 'error', reason: 'network' });
  harness.adapters[1].emit({ state: 'error', reason: 'network' });
  assert.equal(lastState(harness).state, 'error');
  assert.equal(harness.adapters.length, 2);

  harness.controller.retry();
  assert.equal(harness.adapters.length, 3);
  assert.equal(lastState(harness).state, 'connecting');
  assert.equal(lastState(harness).retryCount, 0);

  harness.adapters[2].emit({ state: 'error', reason: 'network' });
  assert.equal(harness.adapters.length, 4);
  assert.equal(lastState(harness).state, 'reconnecting');
});

test('pausing mutes the live source and only reports playing again after resume', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'Direct', type: 'mp3', url: 'https://example.test/live' }, 0);
  harness.adapters[0].emit({ state: 'playing' });
  harness.controller.setPaused(true);

  assert.equal(harness.adapters[0].muted, true);
  assert.equal(lastState(harness).state, 'paused');

  harness.adapters[0].emit({ state: 'buffering' });
  assert.equal(lastState(harness).state, 'paused');

  harness.adapters[0].emit({ state: 'playing' });
  assert.equal(lastState(harness).state, 'paused');

  harness.controller.setPaused(false);
  assert.equal(harness.adapters[0].muted, false);
  assert.equal(lastState(harness).state, 'playing');
});

test('audio output loss uses controlled mute and resumes without the historical deadlock', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'Direct', type: 'mp3', url: 'https://example.test/live' }, 0);
  harness.adapters[0].emit({ state: 'playing' });
  harness.controller.setPaused(true, 'audio-output-changed');

  assert.equal(harness.adapters[0].muted, true);
  assert.equal(lastState(harness).state, 'paused');
  assert.equal(lastState(harness).reason, 'audio-output-changed');

  harness.controller.setPaused(false);

  assert.equal(harness.adapters[0].muted, false);
  assert.equal(lastState(harness).state, 'playing');
  assert.equal(lastState(harness).reason, null);
});

test('a real media pause during output loss rebuilds the source when the user resumes', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'Direct', type: 'mp3', url: 'https://example.test/live' }, 0);
  harness.adapters[0].emit({ state: 'playing' });
  harness.controller.setPaused(true, 'audio-output-changed');
  harness.adapters[0].emit({ state: 'paused' });

  harness.controller.setPaused(false);

  assert.equal(harness.adapters.length, 2);
  assert.equal(harness.adapters[0].destroyed, true);
  assert.equal(lastState(harness).state, 'reconnecting');
  assert.equal(lastState(harness).reason, 'audio-output-changed');
});

test('pausing during connection suspends timeout retries until the user resumes', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'Direct', type: 'mp3', url: 'https://example.test/live' }, 0);
  harness.controller.setPaused(true);
  harness.clock.advance(30000);

  assert.equal(harness.adapters.length, 1);
  assert.equal(lastState(harness).state, 'paused');

  harness.controller.setPaused(false);
  assert.equal(harness.adapters.length, 2);
  assert.equal(lastState(harness).state, 'reconnecting');
});

test('switching stations destroys the old adapter and ignores its stale events', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'First', type: 'mp3', url: 'https://example.test/one' }, 0);
  const firstAdapter = harness.adapters[0];
  const firstSession = harness.controller.getSnapshot().sessionId;

  harness.controller.load({ name: 'Second', type: 'm3u8', url: 'https://example.test/two.m3u8' }, 1);
  const secondSession = harness.controller.getSnapshot().sessionId;

  assert.equal(firstAdapter.destroyed, true);
  assert.notEqual(firstSession, secondSession);

  harness.controller.handleAdapterState(firstSession, { state: 'error', reason: 'network' });
  assert.equal(lastState(harness).stationIndex, 1);
  assert.equal(lastState(harness).state, 'connecting');
});

test('going offline reports an offline error and reconnects when connectivity returns', () => {
  const harness = createHarness();

  harness.controller.load({ name: 'Direct', type: 'mp3', url: 'https://example.test/live' }, 0);
  harness.controller.setOnline(false);

  assert.equal(lastState(harness).state, 'error');
  assert.equal(lastState(harness).reason, 'offline');
  assert.equal(harness.adapters[0].destroyed, true);

  harness.controller.setOnline(true);

  assert.equal(harness.adapters.length, 2);
  assert.equal(lastState(harness).state, 'reconnecting');
  assert.equal(lastState(harness).reason, 'offline');
});
