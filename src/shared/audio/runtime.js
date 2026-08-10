(function exposeAudioRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LofiAudioRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAudioRuntimeModule() {
  function mapMediaError(error) {
    switch (error?.code) {
      case 2:
        return 'network';
      case 3:
        return 'media';
      case 4:
        return 'unsupported';
      default:
        return 'media';
    }
  }

  class BaseMediaAdapter {
    constructor({ media, onStateChange }) {
      this.media = media;
      this.onStateChange = onStateChange || (() => {});
      this.active = false;
      this.listeners = {
        playing: () => this._emit({ state: 'playing' }),
        waiting: () => this._emit({ state: 'buffering' }),
        stalled: () => this._emit({ state: 'buffering' }),
        error: () => this._emit({
          state: 'error',
          reason: mapMediaError(this.media.error)
        })
      };

      Object.entries(this.listeners).forEach(([event, listener]) => {
        this.media.addEventListener(event, listener);
      });
    }

    setMuted(muted) {
      this.media.muted = Boolean(muted);
    }

    setVolume(volume) {
      this.media.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    }

    async _play() {
      try {
        await this.media.play();
      } catch {
        this._emit({ state: 'error', reason: 'media' });
      }
    }

    _emit(event) {
      if (this.active) {
        this.onStateChange(event);
      }
    }

    destroy() {
      this.active = false;
      Object.entries(this.listeners).forEach(([event, listener]) => {
        this.media.removeEventListener(event, listener);
      });
      this.media.pause();
      this.media.removeAttribute('src');
      this.media.load();
    }
  }

  class DirectMediaAdapter extends BaseMediaAdapter {
    async load({ url }) {
      this.active = true;
      this.media.src = url;
      await this._play();
    }
  }

  class HlsMediaAdapter extends BaseMediaAdapter {
    constructor(options) {
      super(options);
      this.HlsClass = options.HlsClass;
      this.hls = null;
    }

    async load({ url }) {
      this.active = true;

      if (this.HlsClass?.isSupported()) {
        this.hls = new this.HlsClass();
        this.hls.on(this.HlsClass.Events.MANIFEST_PARSED, () => {
          this._play();
        });
        this.hls.on(this.HlsClass.Events.ERROR, (_event, data = {}) => {
          if (!data.fatal) return;

          const reason = data.type === this.HlsClass.ErrorTypes.NETWORK_ERROR
            ? 'network'
            : data.type === this.HlsClass.ErrorTypes.MEDIA_ERROR
              ? 'media'
              : 'unsupported';
          this._emit({ state: 'error', reason });
        });
        this.hls.loadSource(url);
        this.hls.attachMedia(this.media);
        return;
      }

      if (this.media.canPlayType('application/vnd.apple.mpegurl')) {
        this.media.src = url;
        await this._play();
        return;
      }

      this._emit({ state: 'error', reason: 'unsupported' });
    }

    destroy() {
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
      super.destroy();
    }
  }

  function bootAudioRuntime({ bridge, media, HlsClass }) {
    let adapter = null;
    let sessionId = null;
    let volume = 0.3;

    const destroyCurrent = () => {
      if (adapter) {
        adapter.destroy();
        adapter = null;
      }
      sessionId = null;
    };

    bridge.onLoad((request) => {
      destroyCurrent();
      sessionId = request.sessionId;
      const onStateChange = (event) => {
        bridge.sendState({
          sessionId,
          ...event
        });
      };

      adapter = request.station.type === 'm3u8'
        ? new HlsMediaAdapter({ media, HlsClass, onStateChange })
        : new DirectMediaAdapter({ media, onStateChange });
      adapter.setVolume(volume);
      adapter.load({ url: request.station.url });
    });

    bridge.onSetVolume((nextVolume) => {
      volume = nextVolume;
      adapter?.setVolume(nextVolume);
    });

    bridge.onDestroy((request) => {
      if (request.sessionId === sessionId) {
        destroyCurrent();
      }
    });

    return {
      destroy: destroyCurrent
    };
  }

  return {
    BaseMediaAdapter,
    DirectMediaAdapter,
    HlsMediaAdapter,
    mapMediaError,
    bootAudioRuntime
  };
});
