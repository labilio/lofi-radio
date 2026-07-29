const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createLoginItemOptions,
    getLaunchAtStartupStatus,
    initializeLaunchAtStartup,
    setLaunchAtStartup
} = require('../startup-service');

test('development mode registers Electron with the application path', () => {
    const options = createLoginItemOptions({
        enabled: true,
        platform: 'win32',
        isPackaged: false,
        execPath: 'C:\\Electron\\electron.exe',
        appPath: 'D:\\lofi-radio'
    });

    assert.deepEqual(options, {
        openAtLogin: true,
        enabled: true,
        path: 'C:\\Electron\\electron.exe',
        args: ['D:\\lofi-radio']
    });
});

test('setting launch at startup verifies the effective Windows state', () => {
    let registered = false;
    const calls = [];
    const fakeApp = {
        isPackaged: true,
        getAppPath: () => 'D:\\lofi-radio',
        setLoginItemSettings(options) {
            calls.push(options);
            registered = options.openAtLogin;
        },
        getLoginItemSettings(options) {
            calls.push(options);
            return {
                openAtLogin: registered,
                executableWillLaunchAtLogin: registered
            };
        }
    };

    const result = setLaunchAtStartup(fakeApp, true, {
        platform: 'win32',
        execPath: 'C:\\Lofi Radio Player.exe'
    });

    assert.equal(result.enabled, true);
    assert.equal(result.registered, true);
    assert.deepEqual(calls, [
        { openAtLogin: true, enabled: true },
        {}
    ]);
});

test('Windows reports disabled when its startup approval blocks the entry', () => {
    const fakeApp = {
        isPackaged: true,
        getAppPath: () => 'D:\\lofi-radio',
        getLoginItemSettings: () => ({
            openAtLogin: true,
            executableWillLaunchAtLogin: false
        })
    };

    const result = getLaunchAtStartupStatus(fakeApp, {
        platform: 'win32',
        execPath: 'C:\\Lofi Radio Player.exe'
    });

    assert.equal(result.registered, true);
    assert.equal(result.enabled, false);
});

test('Windows launch item details confirm an enabled matching executable', () => {
    const fakeApp = {
        isPackaged: true,
        getAppPath: () => 'D:\\lofi-radio',
        getLoginItemSettings: () => ({
            openAtLogin: false,
            executableWillLaunchAtLogin: true,
            launchItems: [{
                name: 'Lofi Radio Player',
                path: 'C:\\Lofi Radio Player.exe',
                args: [],
                scope: 'user',
                enabled: true
            }]
        })
    };

    const result = getLaunchAtStartupStatus(fakeApp, {
        platform: 'win32',
        execPath: 'C:\\Lofi Radio Player.exe'
    });

    assert.equal(result.registered, true);
    assert.equal(result.enabled, true);
});

test('startup initialization reads the saved preference before touching Windows', () => {
    const events = [];
    const fakeApp = {
        isPackaged: true,
        getAppPath: () => 'D:\\lofi-radio',
        setLoginItemSettings(options) {
            events.push(['set', options.openAtLogin]);
        },
        getLoginItemSettings() {
            events.push(['get']);
            return {
                openAtLogin: true,
                executableWillLaunchAtLogin: true
            };
        }
    };

    const result = initializeLaunchAtStartup(
        fakeApp,
        () => {
            events.push(['load-config']);
            return { launchAtStartup: true };
        },
        { platform: 'win32', execPath: 'C:\\Lofi Radio Player.exe' }
    );

    assert.equal(result.enabled, true);
    assert.deepEqual(events, [
        ['load-config'],
        ['set', true],
        ['get']
    ]);
});
