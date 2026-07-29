const path = require('path');

class AudioWindowAdapter {
  constructor({ audioWindow, getVolume }) {
    this.audioWindow = audioWindow;
    this.getVolume = getVolume || (() => null);
    this.listener = () => {};
    this.sessionId = null;
    this.active = false;
    this.generation = 0;
  }

  onStateChange(listener) {
    this.listener = typeof listener === 'function' ? listener : () => {};
  }

  setMuted(muted) {
    if (this._canUseWindow()) {
      this.audioWindow.webContents.setAudioMuted(Boolean(muted));
    }
  }

  handleState(payload = {}) {
    if (!this.active || payload.sessionId !== this.sessionId) {
      return false;
    }

    this.listener({
      state: payload.state,
      reason: payload.reason
    });
    return true;
  }

  destroy() {
    const sessionId = this.sessionId;
    this.active = false;
    this.generation += 1;
    this.listener = () => {};

    if (sessionId !== null) {
      this._send('audio-command-destroy', { sessionId });
    }
  }

  _beginLoad(request) {
    this.sessionId = request.sessionId;
    this.active = true;
    this.generation += 1;
    return this.generation;
  }

  _isCurrent(generation) {
    return this.active && generation === this.generation;
  }

  _canUseWindow() {
    return this.audioWindow &&
      typeof this.audioWindow.isDestroyed === 'function' &&
      !this.audioWindow.isDestroyed() &&
      this.audioWindow.webContents;
  }

  _send(channel, payload) {
    if (this._canUseWindow()) {
      this.audioWindow.webContents.send(channel, payload);
    }
  }
}

class LocalAudioAdapter extends AudioWindowAdapter {
  async load(request) {
    const generation = this._beginLoad(request);
    this.audioWindow.setSize(1, 1);
    await this.audioWindow.loadFile(path.join(__dirname, 'audio.html'));

    if (this._isCurrent(generation)) {
      this._send('audio-command-load', request);
      const volume = this.getVolume();
      if (volume !== null && volume !== undefined) {
        this._send('audio-command-volume', volume);
      }
    }
  }
}

class DirectAudioAdapter extends LocalAudioAdapter {}

class HlsAudioAdapter extends LocalAudioAdapter {}

class BilibiliAudioAdapter extends AudioWindowAdapter {
  async load(request) {
    const generation = this._beginLoad(request);
    this.audioWindow.setSize(1200, 800);
    await this.audioWindow.loadURL(request.station.url);

    if (this._isCurrent(generation)) {
      this._send('audio-command-bilibili', request);
      const volume = this.getVolume();
      if (volume !== null && volume !== undefined) {
        this._send('audio-command-volume', volume);
      }
    }
  }
}

function createAudioWindowAdapter(type, options) {
  switch (type) {
    case 'bilibili':
      return new BilibiliAudioAdapter(options);
    case 'm3u8':
      return new HlsAudioAdapter(options);
    case 'mp3':
    default:
      return new DirectAudioAdapter(options);
  }
}

module.exports = {
  AudioWindowAdapter,
  DirectAudioAdapter,
  HlsAudioAdapter,
  BilibiliAudioAdapter,
  createAudioWindowAdapter
};
