const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

function loadAudioOutputMonitor() {
  try {
    return require('../audio-output-monitor');
  } catch {
    return {};
  }
}

class FakeMediaDevices extends EventEmitter {
  constructor(devices) {
    super();
    this.devices = devices;
    this.enumerationCount = 0;
  }

  async enumerateDevices() {
    this.enumerationCount += 1;
    return this.devices;
  }

  addEventListener(event, listener) {
    this.on(event, listener);
  }

  removeEventListener(event, listener) {
    this.off(event, listener);
  }

  changeTo(devices) {
    this.devices = devices;
    this.emit('devicechange');
  }
}

function output(label, groupId, deviceId = 'default') {
  return {
    kind: 'audiooutput',
    deviceId,
    groupId,
    label
  };
}

test('audio output watcher reports the initial route and later output-only changes', async () => {
  const { watchAudioOutputDevices } = loadAudioOutputMonitor();
  assert.equal(typeof watchAudioOutputDevices, 'function');

  const mediaDevices = new FakeMediaDevices([
    output('Headphones (Bluetooth)', 'headphones'),
    output('Headphones (Bluetooth)', 'headphones', 'headphones-id'),
    { kind: 'audioinput', deviceId: 'microphone', groupId: 'mic', label: 'Microphone' }
  ]);
  const snapshots = [];
  const stop = watchAudioOutputDevices({
    mediaDevices,
    contextId: 'audio-page-1',
    onSnapshot: snapshot => snapshots.push(snapshot)
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].contextId, 'audio-page-1');
  assert.equal(snapshots[0].defaultOutput.label, 'Headphones (Bluetooth)');
  assert.deepEqual(snapshots[0].outputDeviceIds, ['headphones-id']);

  mediaDevices.changeTo([
    output('Headphones (Bluetooth)', 'headphones'),
    output('Headphones (Bluetooth)', 'headphones', 'headphones-id'),
    { kind: 'audioinput', deviceId: 'other-mic', groupId: 'mic-2', label: 'USB Microphone' }
  ]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[1].outputDeviceIds, ['headphones-id']);

  mediaDevices.changeTo([
    output('Speakers (Realtek)', 'speakers'),
    output('Speakers (Realtek)', 'speakers', 'speakers-id')
  ]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(snapshots.length, 3);
  assert.equal(snapshots[2].defaultOutput.label, 'Speakers (Realtek)');
  assert.deepEqual(snapshots[2].outputDeviceIds, ['speakers-id']);

  stop();
  mediaDevices.changeTo([output('Display Audio', 'display')]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(snapshots.length, 3);
});

test('detector ignores initial, duplicate, input-only, and new-page snapshots', () => {
  const { DefaultAudioOutputChangeDetector } = loadAudioOutputMonitor();
  assert.equal(typeof DefaultAudioOutputChangeDetector, 'function');

  const detector = new DefaultAudioOutputChangeDetector();
  const headphones = {
    contextId: 'page-1',
    defaultOutput: { label: 'Headphones', groupId: 'headphones' },
    outputDeviceIds: ['headphones-id']
  };

  assert.equal(detector.observe(headphones), null);
  assert.equal(detector.observe({ ...headphones }), null);
  assert.equal(detector.observe({
    ...headphones,
    contextId: 'page-2'
  }), null);

  assert.deepEqual(detector.observe({
    contextId: 'page-2',
    defaultOutput: { label: 'Speakers', groupId: 'speakers' },
    outputDeviceIds: ['speakers-id']
  }), {
    previous: {
      label: 'Headphones',
      groupId: 'headphones',
      outputDeviceIds: ['headphones-id']
    },
    current: {
      label: 'Speakers',
      groupId: 'speakers',
      outputDeviceIds: ['speakers-id']
    }
  });
});

test('detector ignores changes to unused output devices when the default route stays the same', () => {
  const { DefaultAudioOutputChangeDetector } = loadAudioOutputMonitor();
  const detector = new DefaultAudioOutputChangeDetector();

  assert.equal(detector.observe({
    contextId: 'page-1',
    defaultOutput: { label: 'Headphones', groupId: 'headphones' },
    outputDeviceIds: ['headphones-id']
  }), null);

  assert.equal(detector.observe({
    contextId: 'page-1',
    defaultOutput: { label: 'Headphones', groupId: 'headphones' },
    outputDeviceIds: ['display-audio-id', 'headphones-id']
  }), null);
});

test('coordinator pauses only active playback and never resumes automatically', () => {
  const {
    AudioOutputPauseCoordinator,
    DefaultAudioOutputChangeDetector
  } = loadAudioOutputMonitor();
  assert.equal(typeof AudioOutputPauseCoordinator, 'function');

  let playbackState = 'playing';
  const pauseReasons = [];
  const coordinator = new AudioOutputPauseCoordinator({
    detector: new DefaultAudioOutputChangeDetector(),
    getPlaybackState: () => playbackState,
    pause: reason => {
      pauseReasons.push(reason);
      playbackState = 'paused';
    }
  });

  coordinator.handleSnapshot({
    contextId: 'page-1',
    defaultOutput: { label: 'Headphones', groupId: 'headphones' },
    outputDeviceIds: ['headphones-id']
  });
  coordinator.handleSnapshot({
    contextId: 'page-1',
    defaultOutput: { label: 'Speakers', groupId: 'speakers' },
    outputDeviceIds: ['speakers-id']
  });

  assert.deepEqual(pauseReasons, ['audio-output-changed']);
  assert.equal(playbackState, 'paused');

  coordinator.handleSnapshot({
    contextId: 'page-1',
    defaultOutput: { label: 'Headphones', groupId: 'headphones' },
    outputDeviceIds: ['headphones-id']
  });
  assert.deepEqual(pauseReasons, ['audio-output-changed']);
  assert.equal(playbackState, 'paused');
});

test('IPC bridge accepts snapshots only from the hidden audio window', () => {
  const { registerAudioOutputIpc } = loadAudioOutputMonitor();
  assert.equal(typeof registerAudioOutputIpc, 'function');

  const ipcMain = new EventEmitter();
  const audioWebContents = {};
  const changes = [];
  const dispose = registerAudioOutputIpc({
    ipcMain,
    getAudioWindow: () => ({
      isDestroyed: () => false,
      webContents: audioWebContents
    }),
    coordinator: {
      handleSnapshot: snapshot => changes.push(snapshot)
    }
  });
  const snapshot = {
    contextId: 'page-1',
    defaultOutput: { label: 'Headphones', groupId: 'headphones' },
    outputDeviceIds: ['headphones-id']
  };

  ipcMain.emit('audio-output-snapshot', { sender: {} }, snapshot);
  assert.deepEqual(changes, []);

  ipcMain.emit('audio-output-snapshot', { sender: audioWebContents }, snapshot);
  assert.deepEqual(changes, [snapshot]);

  dispose();
  ipcMain.emit('audio-output-snapshot', { sender: audioWebContents }, snapshot);
  assert.deepEqual(changes, [snapshot]);
});

test('monitoring composition routes an output change through controlled controller pause', () => {
  const { startAudioOutputMonitoring } = loadAudioOutputMonitor();
  assert.equal(typeof startAudioOutputMonitoring, 'function');

  const ipcMain = new EventEmitter();
  const audioWebContents = {};
  let playbackState = 'playing';
  const pauseCalls = [];
  const controller = {
    setPaused(paused, reason) {
      pauseCalls.push({ paused, reason });
      playbackState = paused ? 'paused' : 'playing';
    }
  };
  const dispose = startAudioOutputMonitoring({
    ipcMain,
    getAudioWindow: () => ({
      isDestroyed: () => false,
      webContents: audioWebContents
    }),
    getPlaybackState: () => playbackState,
    getPlaybackController: () => controller
  });

  ipcMain.emit('audio-output-snapshot', { sender: audioWebContents }, {
    contextId: 'page-1',
    defaultOutput: { label: 'Headphones', groupId: 'headphones' },
    outputDeviceIds: ['headphones-id']
  });
  ipcMain.emit('audio-output-snapshot', { sender: audioWebContents }, {
    contextId: 'page-1',
    defaultOutput: { label: 'Speakers', groupId: 'speakers' },
    outputDeviceIds: ['speakers-id']
  });

  assert.deepEqual(pauseCalls, [{
    paused: true,
    reason: 'audio-output-changed'
  }]);

  dispose();
});
