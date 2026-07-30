function isPreventedWindowShortcut(input = {}, platform = process.platform) {
  const key = String(input.key || '').toLowerCase();
  if (key === 'f5') {
    return true;
  }

  const hasPrimaryModifier = platform === 'darwin'
    ? Boolean(input.meta)
    : Boolean(input.control);
  return (key === 'r' || key === 'w') && hasPrimaryModifier && !input.alt;
}

function installWindowShortcutPrevention(
  browserWindow,
  onPreventedShortcut,
  { platform = process.platform } = {}
) {
  browserWindow.webContents.on('before-input-event', (event, input) => {
    if (!isPreventedWindowShortcut(input, platform)) {
      return;
    }

    event.preventDefault();
    if (input.type === 'keyDown' && typeof onPreventedShortcut === 'function') {
      onPreventedShortcut(input);
    }
  });
}

module.exports = {
  installWindowShortcutPrevention,
  isPreventedWindowShortcut
};
