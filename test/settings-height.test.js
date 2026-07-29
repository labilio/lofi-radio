const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');
const fixturePath = path.join(__dirname, 'fixtures', 'electron-settings-height-smoke.cjs');

function inspectRepeatedSubtitleSwitches() {
    return new Promise((resolve, reject) => {
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
                reject(new Error(`Settings height check exited with ${code}\n${stderr}`));
                return;
            }

            const line = stdout
                .split(/\r?\n/)
                .find(output => output.startsWith('HEIGHT_RESULT:'));
            if (!line) {
                reject(new Error(`Settings height check returned no result\n${stdout}\n${stderr}`));
                return;
            }
            resolve(JSON.parse(line.slice('HEIGHT_RESULT:'.length)));
        });
    });
}

test('repeated subtitle mode switches do not progressively grow the settings window', async () => {
    const samples = await inspectRepeatedSubtitleSwitches();
    const regularHeights = samples
        .filter(sample => sample.mode !== 'custom')
        .map(sample => sample.windowHeight);
    const customHeights = samples
        .filter(sample => sample.mode === 'custom')
        .map(sample => sample.windowHeight);

    assert.ok(
        Math.max(...regularHeights) - Math.min(...regularHeights) <= 1,
        `regular modes grew across switches: ${regularHeights.join(', ')}\n${JSON.stringify(samples, null, 2)}`
    );
    assert.ok(
        Math.max(...customHeights) - Math.min(...customHeights) <= 1,
        `custom mode grew across switches: ${customHeights.join(', ')}`
    );
});

test('switching between date and greeting does not request a window resize', async () => {
    const samples = await inspectRepeatedSubtitleSwitches();
    const regularSamples = samples.filter((sample, index) => (
        sample.mode !== 'custom'
        && (index === 0 || samples[index - 1].mode !== 'custom')
    ));

    assert.ok(
        regularSamples.every(sample => sample.requestedHeights.length === 0),
        `regular mode switches requested resizing: ${JSON.stringify(
            regularSamples.map(sample => ({
                mode: sample.mode,
                requestedHeights: sample.requestedHeights
            }))
        )}`
    );
});
