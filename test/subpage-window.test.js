const test = require('node:test');
const assert = require('node:assert/strict');

const subpageWindow = require('../subpage-window');
const { showWindowWhenReady } = subpageWindow;

function createFakeWindow({ visible = false, destroyed = false } = {}) {
  const listeners = new Map();
  const calls = [];

  return {
    calls,
    once(eventName, listener) {
      listeners.set(eventName, listener);
    },
    emit(eventName) {
      listeners.get(eventName)?.();
    },
    isVisible() {
      return visible;
    },
    isDestroyed() {
      return destroyed;
    },
    center() {
      calls.push('center');
    },
    show() {
      calls.push('show');
      visible = true;
    }
  };
}

test('subpage is centered and shown as soon as Electron reports ready-to-show', () => {
  const window = createFakeWindow();

  showWindowWhenReady(window);
  assert.deepEqual(window.calls, []);

  window.emit('ready-to-show');
  assert.deepEqual(window.calls, ['center', 'show']);
});

test('subpage readiness does not show a visible or destroyed window again', () => {
  for (const options of [{ visible: true }, { destroyed: true }]) {
    const window = createFakeWindow(options);
    showWindowWhenReady(window);
    window.emit('ready-to-show');
    assert.deepEqual(window.calls, []);
  }
});

test('fitting a visible settings window keeps its current screen position', () => {
  assert.equal(typeof subpageWindow.fitSettingsWindow, 'function');

  const window = createFakeWindow({ visible: true });
  window.isResizable = () => false;
  window.setResizable = value => window.calls.push(['setResizable', value]);
  window.setSize = (width, height) => window.calls.push(['setSize', width, height]);

  const height = subpageWindow.fitSettingsWindow(window, 638);

  assert.equal(height, 638);
  assert.deepEqual(window.calls, [
    ['setResizable', true],
    ['setSize', 500, 638],
    ['setResizable', false]
  ]);
});

test('fitting a hidden settings window centers it only for its first reveal', () => {
  assert.equal(typeof subpageWindow.fitSettingsWindow, 'function');

  const window = createFakeWindow();
  window.isResizable = () => false;
  window.setResizable = value => window.calls.push(['setResizable', value]);
  window.setSize = (width, height) => window.calls.push(['setSize', width, height]);

  subpageWindow.fitSettingsWindow(window, 638);

  assert.deepEqual(window.calls, [
    ['setResizable', true],
    ['setSize', 500, 638],
    ['setResizable', false],
    'center',
    'show'
  ]);
});
