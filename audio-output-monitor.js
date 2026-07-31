function createAudioOutputSnapshot(devices = [], contextId = '') {
  const outputs = Array.from(devices)
    .filter(device => device?.kind === 'audiooutput');
  const defaultOutput = outputs.find(device => device.deviceId === 'default')
    || outputs[0]
    || null;
  const outputDeviceIds = outputs
    .filter(device => !['default', 'communications'].includes(device.deviceId))
    .map(device => String(device.deviceId || ''))
    .filter(Boolean)
    .sort();

  return {
    contextId: String(contextId || ''),
    defaultOutput: defaultOutput
      ? {
          label: String(defaultOutput.label || ''),
          groupId: String(defaultOutput.groupId || '')
        }
      : {
          label: '',
          groupId: ''
        },
    outputDeviceIds
  };
}

function normalizeSnapshot(snapshot = {}) {
  return {
    contextId: String(snapshot.contextId || ''),
    defaultOutput: {
      label: String(snapshot.defaultOutput?.label || ''),
      groupId: String(snapshot.defaultOutput?.groupId || '')
    },
    outputDeviceIds: Array.isArray(snapshot.outputDeviceIds)
      ? snapshot.outputDeviceIds.map(String).filter(Boolean).sort()
      : []
  };
}

function fingerprint(snapshot) {
  const hasDefaultIdentity = Boolean(
    snapshot.defaultOutput.label || snapshot.defaultOutput.groupId
  );

  return JSON.stringify({
    label: snapshot.defaultOutput.label,
    groupId: snapshot.defaultOutput.groupId,
    outputDeviceIds: hasDefaultIdentity ? [] : snapshot.outputDeviceIds
  });
}

function routeDetails(snapshot) {
  return {
    label: snapshot.defaultOutput.label,
    groupId: snapshot.defaultOutput.groupId,
    outputDeviceIds: [...snapshot.outputDeviceIds]
  };
}

class DefaultAudioOutputChangeDetector {
  constructor() {
    this.contextId = null;
    this.snapshot = null;
    this.fingerprint = null;
  }

  observe(payload) {
    const next = normalizeSnapshot(payload);
    const nextFingerprint = fingerprint(next);

    if (this.contextId !== next.contextId) {
      this.contextId = next.contextId;
      this.snapshot = next;
      this.fingerprint = nextFingerprint;
      return null;
    }

    if (this.fingerprint === nextFingerprint) {
      return null;
    }

    const previous = this.snapshot;
    this.snapshot = next;
    this.fingerprint = nextFingerprint;

    if (!previous) {
      return null;
    }

    return {
      previous: routeDetails(previous),
      current: routeDetails(next)
    };
  }
}

class AudioOutputPauseCoordinator {
  constructor({
    detector = new DefaultAudioOutputChangeDetector(),
    getPlaybackState = () => 'idle',
    pause = () => {}
  } = {}) {
    this.detector = detector;
    this.getPlaybackState = getPlaybackState;
    this.pause = pause;
  }

  handleSnapshot(snapshot) {
    const change = this.detector.observe(snapshot);
    if (change && this.getPlaybackState() === 'playing') {
      this.pause('audio-output-changed');
    }
    return change;
  }
}

function registerAudioOutputIpc({
  ipcMain,
  getAudioWindow,
  coordinator
} = {}) {
  if (!ipcMain ||
      typeof ipcMain.on !== 'function' ||
      typeof getAudioWindow !== 'function' ||
      !coordinator ||
      typeof coordinator.handleSnapshot !== 'function') {
    return () => {};
  }

  const handleSnapshot = (event, snapshot) => {
    const audioWindow = getAudioWindow();
    if (!audioWindow ||
        audioWindow.isDestroyed?.() ||
        event.sender !== audioWindow.webContents) {
      return;
    }
    coordinator.handleSnapshot(snapshot);
  };

  ipcMain.on('audio-output-snapshot', handleSnapshot);
  return () => {
    ipcMain.removeListener?.('audio-output-snapshot', handleSnapshot);
  };
}

function startAudioOutputMonitoring({
  ipcMain,
  getAudioWindow,
  getPlaybackState = () => 'idle',
  getPlaybackController = () => null
} = {}) {
  const coordinator = new AudioOutputPauseCoordinator({
    getPlaybackState,
    pause: reason => {
      getPlaybackController()?.setPaused(true, reason);
    }
  });

  return registerAudioOutputIpc({
    ipcMain,
    getAudioWindow,
    coordinator
  });
}

function watchAudioOutputDevices({
  mediaDevices,
  contextId,
  onSnapshot,
  onError = () => {}
} = {}) {
  if (!mediaDevices ||
      typeof mediaDevices.enumerateDevices !== 'function' ||
      typeof mediaDevices.addEventListener !== 'function' ||
      typeof onSnapshot !== 'function') {
    return () => {};
  }

  let active = true;
  const emitSnapshot = async () => {
    try {
      const devices = await mediaDevices.enumerateDevices();
      if (active) {
        onSnapshot(createAudioOutputSnapshot(devices, contextId));
      }
    } catch (error) {
      if (active) {
        onError(error);
      }
    }
  };
  const handleDeviceChange = () => {
    void emitSnapshot();
  };

  mediaDevices.addEventListener('devicechange', handleDeviceChange);
  void emitSnapshot();

  return () => {
    active = false;
    mediaDevices.removeEventListener?.('devicechange', handleDeviceChange);
  };
}

module.exports = {
  AudioOutputPauseCoordinator,
  DefaultAudioOutputChangeDetector,
  createAudioOutputSnapshot,
  registerAudioOutputIpc,
  startAudioOutputMonitoring,
  watchAudioOutputDevices
};
