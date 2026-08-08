const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('packaging is configured for installable GitHub updates', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  );

  assert.match(packageJson.dependencies['electron-updater'], /^6\./);
  assert.match(packageJson.dependencies['electron-log'], /^5\./);
  assert.equal(packageJson.build.files.includes('auto-update-service.js'), true);
  assert.deepEqual(packageJson.build.win.target, ['nsis']);
  assert.equal(packageJson.build.nsis.oneClick, true);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, false);
  assert.deepEqual(packageJson.build.publish, [
    {
      provider: 'github',
      owner: 'labilio',
      repo: 'lofi-radio'
    }
  ]);
});

test('a completed installer launch opens the compact upgrade-success state', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');

  assert.match(main, /process\.argv\.includes\(['"]--updated['"]\)/);
  assert.match(main, /showLatestWindow\(app\.getVersion\(\), true\)/);
});

test('application checks once after startup without periodic update polling', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');

  assert.match(main, /setTimeout\(\(\) => \{\s*checkForUpdates\(true\);\s*\}, 5000\)/);
  assert.doesNotMatch(main, /setInterval\([^)]*checkForUpdates|checkForUpdates[^;]*setInterval/s);
});
