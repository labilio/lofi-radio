const { EventEmitter } = require('node:events');

function createAutoUpdateService({ updater, logger = console }) {
  if (!updater) {
    throw new TypeError('An updater implementation is required');
  }

  const events = new EventEmitter();
  let initialized = false;
  let latestVersion = null;
  let state = { status: 'idle' };

  function publish(nextState) {
    state = nextState;
    events.emit('state', { ...state });
  }

  function initialize() {
    if (initialized) return;
    initialized = true;

    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.disableWebInstaller = true;
    updater.logger = logger;

    updater.on('checking-for-update', () => {
      publish({ status: 'checking' });
    });
    updater.on('update-available', info => {
      latestVersion = info.version;
      publish({ status: 'available', version: latestVersion });
    });
    updater.on('update-not-available', info => {
      publish({ status: 'up-to-date', version: info?.version || null });
    });
    updater.on('download-progress', progress => {
      publish({
        status: 'downloading',
        version: latestVersion,
        percent: Math.round((Number(progress.percent) || 0) * 10) / 10,
        transferred: Number(progress.transferred) || 0,
        total: Number(progress.total) || 0,
        bytesPerSecond: Number(progress.bytesPerSecond) || 0
      });
    });
    updater.on('update-downloaded', info => {
      latestVersion = info?.version || latestVersion;
      publish({ status: 'downloaded', version: latestVersion });
    });
    updater.on('error', error => {
      publish({
        status: 'error',
        message: error?.message || '更新服务暂时不可用。'
      });
    });
  }

  async function checkForUpdates() {
    initialize();
    try {
      return await updater.checkForUpdates();
    } catch (error) {
      if (state.status !== 'error') {
        publish({
          status: 'error',
          message: error?.message || '更新服务暂时不可用。'
        });
      }
      return null;
    }
  }

  async function downloadUpdate() {
    initialize();
    if (!latestVersion || !['available', 'error'].includes(state.status)) {
      throw new Error('No update is ready to download');
    }
    publish({ status: 'downloading', version: latestVersion, percent: 0 });
    return updater.downloadUpdate();
  }

  function quitAndInstall() {
    if (state.status !== 'downloaded') return false;
    updater.quitAndInstall(false, true);
    return true;
  }

  return {
    initialize,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    getState: () => ({ ...state }),
    on: (eventName, listener) => {
      events.on(eventName, listener);
      return () => events.off(eventName, listener);
    }
  };
}

module.exports = { createAutoUpdateService };
