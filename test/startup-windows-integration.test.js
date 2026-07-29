const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');
const fixturePath = path.join(__dirname, 'fixtures', 'electron-startup-registration-smoke.cjs');
const shouldRun = process.platform === 'win32'
    && process.env.RUN_WINDOWS_STARTUP_INTEGRATION === '1';

test('registers, verifies, and removes a real Windows login item', {
    skip: shouldRun ? false : 'set RUN_WINDOWS_STARTUP_INTEGRATION=1 to mutate a temporary Windows login item'
}, async () => {
    const result = await new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;

        const child = spawn(electronPath, [fixturePath], {
            cwd: projectRoot,
            env,
            windowsHide: true
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', chunk => {
            stdout += chunk;
        });
        child.stderr.on('data', chunk => {
            stderr += chunk;
        });
        child.on('error', reject);
        child.on('exit', code => {
            if (code !== 0) {
                reject(new Error(`Electron startup smoke test exited with ${code}\n${stderr}`));
                return;
            }

            const line = stdout
                .split(/\r?\n/)
                .find(output => output.startsWith('STARTUP_RESULT:'));
            if (!line) {
                reject(new Error(`Electron startup smoke test returned no result\n${stdout}\n${stderr}`));
                return;
            }
            resolve(JSON.parse(line.slice('STARTUP_RESULT:'.length)));
        });
    });

    assert.equal(result.registered.registered, true);
    assert.equal(result.registered.enabled, true);
    assert.equal(result.registered.executableWillLaunchAtLogin, true);
    assert.equal(result.registered.launchItem.enabled, true);
    assert.equal(result.removed.registered, false);
    assert.equal(result.removed.enabled, false);
    assert.equal(result.removed.launchItem, null);
});
