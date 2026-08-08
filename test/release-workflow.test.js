const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.resolve(
  __dirname,
  '..',
  '.github',
  'workflows',
  'release.yml'
);

function readWorkflow() {
  assert.equal(fs.existsSync(workflowPath), true, `missing workflow: ${workflowPath}`);
  return fs.readFileSync(workflowPath, 'utf8');
}

test('desktop workflow supports private manual builds and v-tag releases', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /^on:\r?\n\s{2}workflow_dispatch:\s*$/m);
  assert.match(workflow, /^\s{2}push:\r?\n\s{4}tags:\r?\n\s{6}- ['"]v\*['"]\s*$/m);
  assert.match(workflow, /^permissions:\r?\n\s{2}contents:\s*read\s*$/m);
});

test('workflow pins every GitHub action to an immutable commit', () => {
  const workflow = readWorkflow();

  for (const action of [
    'actions/checkout',
    'actions/setup-node',
    'actions/upload-artifact',
    'actions/download-artifact'
  ]) {
    assert.match(workflow, new RegExp(`uses:\\s*${action}@[0-9a-f]{40}(?:\\s|$)`));
  }
});

test('Windows job builds and validates updater-compatible NSIS assets', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /^\s{2}build-windows:\s*$/m);
  assert.match(workflow, /runs-on:\s*windows-2022/);
  assert.match(workflow, /electron-builder --win --x64 --publish=never/);
  assert.match(workflow, /latest\.yml/);
  assert.match(workflow, /\.exe\.blockmap/);
  assert.match(workflow, /\^path:\\s\*\(\.\+\)\$/);
  assert.match(workflow, /Start-Process/);
  assert.match(workflow, /--user-data-dir/);
  assert.match(workflow, /0x8664/);
});

test('macOS jobs build, verify, and launch native arm64 and Intel packages', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /runner:\s*macos-latest[\s\S]{0,180}arch:\s*arm64[\s\S]{0,180}builder_flag:\s*--arm64/);
  assert.match(workflow, /runner:\s*macos-15-intel[\s\S]{0,180}arch:\s*x64[\s\S]{0,180}builder_flag:\s*--x64/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /Signature=adhoc/);
  assert.match(workflow, /hdiutil verify/);
  assert.match(workflow, /kill -0/);
  assert.match(workflow, /mac-\$\{\{ matrix\.arch \}\}\.dmg/);
});

test('release job prepares a draft with all assets only for a pushed version tag', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /^\s{2}publish-release:\s*$/m);
  assert.match(workflow, /if:\s*startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /--generate-notes/);
  assert.match(workflow, /merge-multiple:\s*true/);
});
