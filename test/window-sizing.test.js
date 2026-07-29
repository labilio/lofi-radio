const test = require('node:test');
const assert = require('node:assert/strict');
const { resizeFixedWindow } = require('../window-sizing');

test('temporarily unlocks a fixed window so it can shrink programmatically', () => {
    const calls = [];
    const window = {
        isResizable: () => false,
        setResizable: value => calls.push(['setResizable', value]),
        setSize: (width, height) => calls.push(['setSize', width, height])
    };

    resizeFixedWindow(window, 500, 527);

    assert.deepEqual(calls, [
        ['setResizable', true],
        ['setSize', 500, 527],
        ['setResizable', false]
    ]);
});

test('leaves an already resizable window unlocked', () => {
    const calls = [];
    const window = {
        isResizable: () => true,
        setResizable: value => calls.push(['setResizable', value]),
        setSize: (width, height) => calls.push(['setSize', width, height])
    };

    resizeFixedWindow(window, 500, 527);

    assert.deepEqual(calls, [
        ['setSize', 500, 527]
    ]);
});
