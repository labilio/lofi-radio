const { resizeFixedWindow } = require('./window-sizing');

function showWindowWhenReady(window) {
  const reveal = () => {
    if (!window || window.isDestroyed() || window.isVisible()) {
      return false;
    }

    window.center();
    window.show();
    return true;
  };

  window.once('ready-to-show', reveal);
  return reveal;
}

function fitSettingsWindow(window, contentHeight) {
  if (!window || window.isDestroyed()) {
    return false;
  }

  const height = Math.max(440, Math.ceil(Number(contentHeight) || 440));
  const shouldReveal = !window.isVisible();
  resizeFixedWindow(window, 500, height);

  if (shouldReveal) {
    window.center();
    window.show();
  }

  return height;
}

module.exports = {
  fitSettingsWindow,
  showWindowWhenReady
};
