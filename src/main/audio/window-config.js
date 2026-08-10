const path = require('path');

function createAudioWindowWebPreferences(
  projectRoot = path.resolve(__dirname, '..', '..', '..')
) {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: false,
    enableRemoteModule: false,
    preload: path.join(projectRoot, 'src', 'preload', 'audio.js')
  };
}

module.exports = {
  createAudioWindowWebPreferences
};
