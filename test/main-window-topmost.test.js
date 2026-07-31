const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'main.js'),
  'utf8'
);

test('the main widget remains always on top after a second-instance activation', () => {
  assert.match(
    mainSource,
    /mainWindow\s*=\s*new BrowserWindow\(\{[\s\S]*?alwaysOnTop:\s*true/
  );
  assert.doesNotMatch(
    mainSource,
    /mainWindow\.setAlwaysOnTop\(false\)/
  );
});
