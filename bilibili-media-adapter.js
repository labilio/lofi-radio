const { mapMediaError } = require('./audio-runtime');

class BilibiliMediaAdapter {
  constructor(options = {}) {
    this.document = options.document || globalThis.document;
    this.scheduler = options.scheduler || {
      setInterval: (callback, delay) => setInterval(callback, delay),
      clearInterval: (timer) => clearInterval(timer)
    };
    this.listener = () => {};
    this.boundVideos = new Map();
    this.pollTimer = null;
    this.active = false;
    this.volume = 0.3;
    this.muted = false;
  }

  onStateChange(listener) {
    this.listener = typeof listener === 'function' ? listener : () => {};
  }

  load() {
    this.active = true;
    this._scan();
    this.pollTimer = this.scheduler.setInterval(() => this._scan(), 500);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.boundVideos.forEach((_listeners, video) => {
      video.muted = this.muted;
    });
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    this.boundVideos.forEach((_listeners, video) => {
      video.volume = this.volume;
    });
  }

  destroy() {
    this.active = false;

    if (this.pollTimer !== null) {
      this.scheduler.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.boundVideos.forEach((listeners, video) => {
      Object.entries(listeners).forEach(([event, listener]) => {
        video.removeEventListener(event, listener);
      });
    });
    this.boundVideos.clear();
    this.listener = () => {};
  }

  _scan() {
    if (!this.active) return;

    const videos = this.document?.querySelectorAll?.('video') || [];
    [...videos].forEach((video) => {
      if (this.boundVideos.has(video)) {
        video.volume = this.volume;
        video.muted = this.muted;
        return;
      }

      const listeners = {
        playing: () => this._emit({ state: 'playing' }),
        waiting: () => this._emit({ state: 'buffering' }),
        stalled: () => this._emit({ state: 'buffering' }),
        error: () => this._emit({
          state: 'error',
          reason: mapMediaError(video.error)
        })
      };

      Object.entries(listeners).forEach(([event, listener]) => {
        video.addEventListener(event, listener);
      });

      this.boundVideos.set(video, listeners);
      video.volume = this.volume;
      video.muted = this.muted;

      if (!video.paused && video.readyState >= 3) {
        this._emit({ state: 'playing' });
      } else {
        Promise.resolve(video.play()).catch(() => {});
      }
    });
  }

  _emit(event) {
    if (this.active) {
      this.listener(event);
    }
  }
}

module.exports = {
  BilibiliMediaAdapter
};
