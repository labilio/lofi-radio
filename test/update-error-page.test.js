const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectElectronPage } = require('./electron-test-utils');

test('rate-limit failures render as a friendly in-app update state', async () => {
    const result = await inspectElectronPage('update-error.html', [], {
        query: { reason: 'rate-limited' }
    });

    assert.deepEqual(result.externalResources, []);
    assert.match(result.bodyText, /GitHub 暂时限制了检查频率/);
    assert.doesNotMatch(result.bodyText, /HTTP error|status:\s*403/i);
    assert.deepEqual(
        result.buttonIds.sort(),
        ['closeBtn', 'retryBtn', 'viewChangesBtn'].sort()
    );
});
