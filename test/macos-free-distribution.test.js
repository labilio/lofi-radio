const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('certificate-free macOS packages use ad-hoc signing with Hardened Runtime', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  );

  assert.equal(packageJson.build.mac.identity, '-');
  assert.equal(packageJson.build.mac.hardenedRuntime, true);
});

test('macOS entitlements allow the signed Electron runtime to load its libraries', () => {
  const entitlements = fs.readFileSync(
    path.join(projectRoot, 'build', 'entitlements.mac.plist'),
    'utf8'
  );

  for (const entitlement of [
    'com.apple.security.cs.disable-library-validation',
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory'
  ]) {
    assert.match(
      entitlements,
      new RegExp(`<key>${entitlement}</key>\\s*<true\\s*\\/>`)
    );
  }
});
