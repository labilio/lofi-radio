const path = require('path');

function createAudioWindowWebPreferences(projectRoot = __dirname) {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: false,
    enableRemoteModule: false,
    preload: path.join(projectRoot, 'audio-preload.js')
  };
}

module.exports = {
  createAudioWindowWebPreferences
};
