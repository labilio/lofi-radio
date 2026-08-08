const test = require('node:test');
const assert = require('node:assert/strict');

const {
    checkLatestRelease,
    compareVersions,
    getUpdateDeliveryMode,
    openLatestReleasePage,
    shouldSkipUpdateReminder
} = require('../update-service');

function response({
    ok = true,
    status = 200,
    url = 'https://api.github.com/repos/labilio/lofi-radio/releases/latest',
    json = {}
} = {}) {
    return {
        ok,
        status,
        url,
        headers: {
            get: () => null
        },
        json: async () => json
    };
}

test('numeric version comparison handles double-digit minor versions', () => {
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
    assert.equal(compareVersions('1.3.0', '1.3.0'), 0);
    assert.equal(compareVersions('1.2.9', '1.3.0'), -1);
});

test('only packaged Windows builds use the automatic installer delivery', () => {
    assert.equal(getUpdateDeliveryMode({ platform: 'win32', isPackaged: true }), 'automatic');
    assert.equal(getUpdateDeliveryMode({ platform: 'darwin', isPackaged: true }), 'manual');
    assert.equal(getUpdateDeliveryMode({ platform: 'linux', isPackaged: true }), 'manual');
    assert.equal(getUpdateDeliveryMode({ platform: 'win32', isPackaged: false }), 'manual');
});

test('manual delivery opens only the trusted latest Release and then closes its window', async () => {
    const openedUrls = [];
    let closeCalls = 0;

    await openLatestReleasePage({
        openExternal: async url => openedUrls.push(url),
        closeWindow: () => {
            closeCalls += 1;
        }
    });

    assert.deepEqual(openedUrls, [
        'https://github.com/labilio/lofi-radio/releases/latest'
    ]);
    assert.equal(closeCalls, 1);
});

test('silent reminders are skipped only for the exact version the user chose', () => {
    assert.equal(shouldSkipUpdateReminder({
        silent: true,
        latestVersion: '1.4.0',
        skippedUpdateVersion: '1.4.0'
    }), true);
    assert.equal(shouldSkipUpdateReminder({
        silent: true,
        latestVersion: '1.5.0',
        skippedUpdateVersion: '1.4.0'
    }), false);
    assert.equal(shouldSkipUpdateReminder({
        silent: false,
        latestVersion: '1.4.0',
        skippedUpdateVersion: '1.4.0'
    }), false);
    assert.equal(shouldSkipUpdateReminder({
        silent: true,
        latestVersion: '1.4.0',
        skippedUpdateVersion: true
    }), false);
});

test('falls back to the GitHub releases redirect when the API is rate limited', async () => {
    const responses = [
        response({ ok: false, status: 403 }),
        response({
            url: 'https://github.com/labilio/lofi-radio/releases/tag/v1.4.0'
        })
    ];
    const fetchImpl = async () => responses.shift();

    const result = await checkLatestRelease({
        currentVersion: '1.3.0',
        fetchImpl,
        timeoutMs: 100
    });

    assert.deepEqual(result, {
        status: 'update-available',
        currentVersion: '1.3.0',
        latestVersion: '1.4.0',
        releaseUrl: 'https://github.com/labilio/lofi-radio/releases/tag/v1.4.0'
    });
});

test('returns a friendly rate-limit result instead of throwing', async () => {
    const fetchImpl = async () => response({ ok: false, status: 403 });

    const result = await checkLatestRelease({
        currentVersion: '1.3.0',
        fetchImpl,
        timeoutMs: 100
    });

    assert.equal(result.status, 'error');
    assert.equal(result.reason, 'rate-limited');
    assert.match(result.message, /稍后再试/);
});

test('returns an offline result when both update endpoints are unreachable', async () => {
    const fetchImpl = async () => {
        throw new TypeError('fetch failed');
    };

    const result = await checkLatestRelease({
        currentVersion: '1.3.0',
        fetchImpl,
        timeoutMs: 100
    });

    assert.equal(result.status, 'error');
    assert.equal(result.reason, 'offline');
    assert.match(result.message, /网络/);
});

test('returns up-to-date when the current version matches the release', async () => {
    const fetchImpl = async () => response({
        json: {
            tag_name: 'v1.3.0',
            html_url: 'https://github.com/labilio/lofi-radio/releases/tag/v1.3.0'
        }
    });

    const result = await checkLatestRelease({
        currentVersion: '1.3.0',
        fetchImpl,
        timeoutMs: 100
    });

    assert.deepEqual(result, {
        status: 'up-to-date',
        currentVersion: '1.3.0',
        latestVersion: '1.3.0',
        releaseUrl: 'https://github.com/labilio/lofi-radio/releases/tag/v1.3.0'
    });
});
