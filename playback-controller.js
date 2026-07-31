const DEFAULT_CONNECT_TIMEOUTS = Object.freeze({
  mp3: 12000,
  m3u8: 12000,
  bilibili: 20000
});

const VALID_STATES = new Set([
  'idle',
  'connecting',
  'playing',
  'buffering',
  'reconnecting',
  'paused',
  'error'
]);

class PlaybackController {
  constructor(options = {}) {
    if (typeof options.createAdapter !== 'function') {
      throw new TypeError('PlaybackController requires createAdapter');
    }

    this.createAdapter = options.createAdapter;
    this.onStateChange = options.onStateChange || (() => {});
    this.scheduler = options.scheduler || {
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (timer) => clearTimeout(timer)
    };
    this.connectTimeouts = {
      ...DEFAULT_CONNECT_TIMEOUTS,
      ...(options.connectTimeouts || {})
    };
    this.stallTimeout = options.stallTimeout || 8000;
    this.maxRetries = options.maxRetries ?? 1;

    this.adapter = null;
    this.station = null;
    this.stationIndex = -1;
    this.sessionId = 0;
    this.state = 'idle';
    this.reason = null;
    this.retryCount = 0;
    this.userPaused = false;
    this.mediaState = 'idle';
    this.online = true;
    this.connectTimer = null;
    this.stallTimer = null;
  }

  load(station, stationIndex) {
    if (!station || !station.url) {
      throw new TypeError('A station with a URL is required');
    }

    this.station = { ...station, type: station.type || 'mp3' };
    this.stationIndex = stationIndex;
    this.retryCount = 0;
    this.userPaused = false;

    if (!this.online) {
      this._destroyAdapter();
      this._emit('error', 'offline');
      return this.getSnapshot();
    }

    this._startAttempt({ reconnecting: false, reason: null });
    return this.getSnapshot();
  }

  retry() {
    if (!this.station) return false;

    this.retryCount = 0;
    this.userPaused = false;

    if (!this.online) {
      this._destroyAdapter();
      this._emit('error', 'offline');
      return false;
    }

    this._startAttempt({ reconnecting: false, reason: null });
    return true;
  }

  setPaused(paused, reason = null) {
    const nextPaused = Boolean(paused);
    if (this.userPaused === nextPaused) return;

    this.userPaused = nextPaused;
    if (this.adapter) {
      this.adapter.setMuted(nextPaused);
    }

    if (nextPaused) {
      this._clearTimers();
      this._emit('paused', reason);
      return;
    }

    if (this.mediaState === 'playing') {
      this._clearConnectTimer();
      this._emit('playing', null);
    } else if (this.mediaState === 'buffering') {
      this._emit('buffering', null);
      this._scheduleStallTimeout();
    } else {
      this._startAttempt({ reconnecting: true, reason: this.reason });
    }
  }

  togglePaused() {
    this.setPaused(!this.userPaused);
  }

  setOnline(online) {
    const nextOnline = Boolean(online);
    if (this.online === nextOnline) return;

    this.online = nextOnline;
    if (!nextOnline) {
      this._clearTimers();
      this._destroyAdapter();
      this.mediaState = 'error';
      this._emit('error', 'offline');
      return;
    }

    if (this.station && this.state === 'error' && this.reason === 'offline' && !this.userPaused) {
      this._startAttempt({ reconnecting: true, reason: 'offline' });
    }
  }

  handleAdapterState(sessionId, event = {}) {
    if (sessionId !== this.sessionId || !VALID_STATES.has(event.state)) {
      return false;
    }

    switch (event.state) {
      case 'playing':
        this.mediaState = 'playing';
        this._clearTimers();
        this._emit(this.userPaused ? 'paused' : 'playing', null);
        return true;

      case 'buffering':
        this.mediaState = 'buffering';
        this._clearConnectTimer();
        if (!this.userPaused) {
          this._emit('buffering', null);
          this._scheduleStallTimeout();
        }
        return true;

      case 'paused':
        this.mediaState = 'paused';
        if (this.userPaused) {
          this._emit('paused', this.reason);
        } else {
          this._handleFailure(event.reason || 'media');
        }
        return true;

      case 'error':
        this.mediaState = 'error';
        this._handleFailure(event.reason || 'media');
        return true;

      default:
        return false;
    }
  }

  getSnapshot() {
    return {
      sessionId: this.sessionId,
      stationIndex: this.stationIndex,
      state: this.state,
      reason: this.reason,
      retryCount: this.retryCount
    };
  }

  destroy() {
    this._clearTimers();
    this._destroyAdapter();
    this.station = null;
    this.stationIndex = -1;
    this.mediaState = 'idle';
    this._emit('idle', null);
  }

  _startAttempt({ reconnecting, reason }) {
    this._clearTimers();
    this._destroyAdapter();

    this.sessionId += 1;
    const attemptSessionId = this.sessionId;
    const type = this.station.type || 'mp3';
    this.mediaState = 'connecting';
    this.adapter = this.createAdapter(type);

    if (!this.adapter ||
        typeof this.adapter.load !== 'function' ||
        typeof this.adapter.setMuted !== 'function' ||
        typeof this.adapter.destroy !== 'function' ||
        typeof this.adapter.onStateChange !== 'function') {
      throw new TypeError(`Invalid playback adapter for ${type}`);
    }

    this.adapter.onStateChange((event) => {
      this.handleAdapterState(attemptSessionId, event);
    });
    this.adapter.setMuted(this.userPaused);
    this._emit(reconnecting ? 'reconnecting' : 'connecting', reason);
    this._scheduleConnectTimeout(attemptSessionId, type);

    try {
      const result = this.adapter.load({
        station: this.station,
        stationIndex: this.stationIndex,
        sessionId: attemptSessionId
      });
      Promise.resolve(result).catch(() => {
        if (attemptSessionId === this.sessionId) {
          this._handleFailure('network');
        }
      });
    } catch {
      this._handleFailure('network');
    }
  }

  _handleFailure(reason) {
    this._clearTimers();

    if (reason === 'offline' || !this.online) {
      this._destroyAdapter();
      this._emit('error', 'offline');
      return;
    }

    if (this.retryCount < this.maxRetries) {
      this.retryCount += 1;
      this._startAttempt({ reconnecting: true, reason });
      return;
    }

    this._destroyAdapter();
    this._emit('error', reason);
  }

  _scheduleConnectTimeout(sessionId, type) {
    const delay = this.connectTimeouts[type] || this.connectTimeouts.mp3;
    this.connectTimer = this.scheduler.setTimeout(() => {
      this.connectTimer = null;
      if (sessionId === this.sessionId && this.mediaState === 'connecting') {
        this._handleFailure('connect-timeout');
      }
    }, delay);
  }

  _scheduleStallTimeout() {
    this._clearStallTimer();
    const sessionId = this.sessionId;
    this.stallTimer = this.scheduler.setTimeout(() => {
      this.stallTimer = null;
      if (sessionId === this.sessionId && this.mediaState === 'buffering' && !this.userPaused) {
        this._handleFailure('stall-timeout');
      }
    }, this.stallTimeout);
  }

  _emit(state, reason) {
    this.state = state;
    this.reason = reason || null;
    this.onStateChange(this.getSnapshot());
  }

  _destroyAdapter() {
    if (!this.adapter) return;

    try {
      this.adapter.destroy();
    } finally {
      this.adapter = null;
    }
  }

  _clearConnectTimer() {
    if (this.connectTimer !== null) {
      this.scheduler.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  _clearStallTimer() {
    if (this.stallTimer !== null) {
      this.scheduler.clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  _clearTimers() {
    this._clearConnectTimer();
    this._clearStallTimer();
  }
}

module.exports = {
  PlaybackController,
  DEFAULT_CONNECT_TIMEOUTS
};
