const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createAutoUpdateService } = require('../auto-update-service');

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = true;
    this.autoInstallOnAppQuit = false;
    this.checkCalls = 0;
    this.downloadCalls = 0;
    this.installCalls = [];
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    return { updateInfo: { version: '1.4.0' } };
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
    return ['installer.exe'];
  }

  quitAndInstall(isSilent, isForceRunAfter) {
    this.installCalls.push({ isSilent, isForceRunAfter });
  }
}

test('initialization disables automatic downloads and binds updater events once', () => {
  const updater = new FakeUpdater();
  const service = createAutoUpdateService({ updater });

  service.initialize();
  service.initialize();

  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.disableWebInstaller, true);
  assert.equal(updater.listenerCount('update-available'), 1);
  assert.equal(updater.listenerCount('download-progress'), 1);
});

test('checking for an update never starts a download by itself', async () => {
  const updater = new FakeUpdater();
  const service = createAutoUpdateService({ updater });

  await service.checkForUpdates();
  updater.emit('update-available', { version: '1.4.0' });

  assert.equal(updater.checkCalls, 1);
  assert.equal(updater.downloadCalls, 0);
  assert.deepEqual(service.getState(), {
    status: 'available',
    version: '1.4.0'
  });
});

test('download starts only after an explicit user action and forwards progress', async () => {
  const updater = new FakeUpdater();
  const service = createAutoUpdateService({ updater });
  const states = [];
  service.on('state', state => states.push(state));

  service.initialize();
  updater.emit('update-available', { version: '1.4.0' });
  await service.downloadUpdate();
  updater.emit('download-progress', {
    percent: 42.37,
    transferred: 4237,
    total: 10000,
    bytesPerSecond: 2048
  });

  assert.equal(updater.downloadCalls, 1);
  assert.deepEqual(states.at(-1), {
    status: 'downloading',
    version: '1.4.0',
    percent: 42.4,
    transferred: 4237,
    total: 10000,
    bytesPerSecond: 2048
  });
});

test('restart installation is allowed only after the update has downloaded', () => {
  const updater = new FakeUpdater();
  const service = createAutoUpdateService({ updater });

  service.initialize();
  assert.equal(service.quitAndInstall(), false);

  updater.emit('update-available', { version: '1.4.0' });
  updater.emit('update-downloaded', { version: '1.4.0' });

  assert.equal(service.quitAndInstall(), true);
  assert.deepEqual(updater.installCalls, [
    { isSilent: false, isForceRunAfter: true }
  ]);
});

test('updater errors become a displayable state instead of an unhandled event', () => {
  const updater = new FakeUpdater();
  const service = createAutoUpdateService({ updater });

  service.initialize();
  updater.emit('error', new Error('network unavailable'));

  assert.deepEqual(service.getState(), {
    status: 'error',
    message: 'network unavailable'
  });
});
