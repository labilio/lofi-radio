(function exposePlaybackPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LofiPlaybackPresentation = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaybackPresentation() {
  const subtitles = Object.freeze({
    connecting: '正在连接…',
    buffering: '网络缓冲中…',
    reconnecting: '正在重新连接…',
    error: '连接失败 · 点击唱片重试'
  });

  function getPlaybackPresentation(status = {}) {
    const state = status.state || 'idle';
    const subtitle = state === 'paused' && status.reason === 'audio-output-changed'
      ? '音频设备已变化 · 已暂停'
      : subtitles[state] || null;
    return {
      subtitle,
      isPlaying: state === 'playing',
      isError: state === 'error',
      retryable: state === 'error'
    };
  }

  function isFocusPlaybackActive(status = {}) {
    return status.state === 'playing';
  }

  return {
    getPlaybackPresentation,
    isFocusPlaybackActive
  };
});
