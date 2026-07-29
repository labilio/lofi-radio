const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listPackage } = require('@electron/asar');

const projectRoot = path.resolve(__dirname, '..');
const asarPath = path.join(
  projectRoot,
  'dist_green',
  'win-unpacked',
  'resources',
  'app.asar'
);

test('packaged app contains runtime files without local development artifacts', {
  skip: process.env.RUN_PACKAGED_CONTENT_AUDIT !== '1'
}, () => {
  assert.ok(fs.existsSync(asarPath), `missing packaged app: ${asarPath}`);

  const entries = listPackage(asarPath);
  const forbidden = entries.filter((entry) => (
    /^\\(?:\.claude|\.trae|\.learnings|\.superpowers|\.tmp[^\\]*|docs|test|tests)(?:\\|$)/i.test(entry)
    || /^\\styles\.extra\.css$/i.test(entry)
    || /^\\(?!node_modules\\).*\.md$/i.test(entry)
  ));

  assert.equal(
    forbidden.length,
    0,
    `development artifacts found in app.asar (${forbidden.length} entries):\n${forbidden.slice(0, 30).join('\n')}`
  );

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  );
  const requiredRuntimeFiles = packageJson.build.files
    .filter((entry) => typeof entry === 'string')
    .map((entry) => `\\${entry.replaceAll('/', '\\')}`);

  for (const required of requiredRuntimeFiles) {
    assert.ok(entries.includes(required), `required runtime file missing from app.asar: ${required}`);
  }

  const packagedEntrySet = new Set(entries);
  const javascriptFiles = packageJson.build.files.filter(
    (entry) => typeof entry === 'string' && entry.endsWith('.js')
  );

  for (const javascriptFile of javascriptFiles) {
    const sourcePath = path.join(projectRoot, javascriptFile);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const localRequires = source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g);

    for (const match of localRequires) {
      const dependencyBase = path.resolve(path.dirname(sourcePath), match[1]);
      const dependencyPath = ['', '.js', '.json']
        .map((extension) => `${dependencyBase}${extension}`)
        .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

      assert.ok(dependencyPath, `${javascriptFile} requires missing local module: ${match[1]}`);

      const packagedDependency = `\\${path
        .relative(projectRoot, dependencyPath)
        .replaceAll('/', '\\')}`;
      assert.ok(
        packagedEntrySet.has(packagedDependency),
        `${javascriptFile} requires local module missing from app.asar: ${packagedDependency}`
      );
    }
  }

  const size = fs.statSync(asarPath).size;
  assert.ok(size < 50 * 1024 * 1024, `app.asar is unexpectedly large: ${size} bytes`);
});
