const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPlaybackPresentation,
  isFocusPlaybackActive
} = require('../playback-presentation');

test('transient playback states temporarily replace the configured subtitle', () => {
  assert.deepEqual(getPlaybackPresentation({ state: 'connecting' }), {
    subtitle: '正在连接…',
    isPlaying: false,
    isError: false,
    retryable: false
  });
  assert.equal(getPlaybackPresentation({ state: 'buffering' }).subtitle, '网络缓冲中…');
  assert.equal(getPlaybackPresentation({ state: 'reconnecting' }).subtitle, '正在重新连接…');
});

test('playing and paused states restore the configured subtitle', () => {
  assert.equal(getPlaybackPresentation({ state: 'playing' }).subtitle, null);
  assert.equal(getPlaybackPresentation({ state: 'paused' }).subtitle, null);
  assert.equal(getPlaybackPresentation({ state: 'playing' }).isPlaying, true);
  assert.equal(getPlaybackPresentation({ state: 'paused' }).isPlaying, false);
});

test('error state is retryable and uses the compact failure message', () => {
  assert.deepEqual(getPlaybackPresentation({ state: 'error' }), {
    subtitle: '连接失败 · 点击唱片重试',
    isPlaying: false,
    isError: true,
    retryable: true
  });
});

test('focus time advances only while media is actually playing', () => {
  for (const state of ['idle', 'connecting', 'buffering', 'reconnecting', 'paused', 'error']) {
    assert.equal(isFocusPlaybackActive({ state }), false, state);
  }
  assert.equal(isFocusPlaybackActive({ state: 'playing' }), true);
});
