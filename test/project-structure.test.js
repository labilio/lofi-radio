const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('runtime files follow Electron process boundaries instead of living at the repository root', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  );

  assert.equal(packageJson.main, 'src/main/index.js');

  for (const runtimeDirectory of [
    'src/main',
    'src/preload',
    'src/renderer',
    'src/shared',
    'resources'
  ]) {
    assert.equal(
      fs.statSync(path.join(projectRoot, runtimeDirectory)).isDirectory(),
      true,
      `missing runtime directory: ${runtimeDirectory}`
    );
  }

  const rootRuntimeFiles = fs.readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(?:css|html|js|json)$/i.test(name))
    .filter((name) => !['package.json', 'package-lock.json'].includes(name));

  assert.deepEqual(rootRuntimeFiles, []);
});
