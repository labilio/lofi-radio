const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');
const runnerPath = path.join(__dirname, 'fixtures', 'electron-page-smoke.cjs');

function inspectElectronPage(page, expectedTags = [], options = {}) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        if (options.query) env.PAGE_QUERY = JSON.stringify(options.query);
        if (options.screenshotPath) env.SCREENSHOT_PATH = path.resolve(options.screenshotPath);

        const targetPagePath = options.absolutePagePath
            ? path.resolve(options.absolutePagePath)
            : path.join(projectRoot, page);
        const child = spawn(electronPath, [runnerPath, targetPagePath, ...expectedTags], {
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
                reject(new Error(`Electron page check failed for ${page} (exit ${code})\n${stderr}`));
                return;
            }

            const resultLine = stdout
                .split(/\r?\n/)
                .find(line => line.startsWith('PAGE_RESULT:'));

            if (!resultLine) {
                reject(new Error(`Electron page check returned no result for ${page}\n${stdout}\n${stderr}`));
                return;
            }

            resolve(JSON.parse(resultLine.slice('PAGE_RESULT:'.length)));
        });
    });
}

module.exports = {
    inspectElectronPage
};
