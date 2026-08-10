const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');
const runnerPath = path.join(__dirname, 'fixtures', 'electron-page-smoke.cjs');

const pageDefinitions = {
    'audio.html': { path: 'src/renderer/audio/index.html', kind: 'audio' },
    'settings.html': { path: 'src/renderer/settings/index.html', kind: 'settings' },
    'history.html': { path: 'src/renderer/history/index.html', kind: 'history' },
    'update.html': { path: 'src/renderer/update/available.html', kind: 'update-available' },
    'update-latest.html': { path: 'src/renderer/update/latest.html', kind: 'update-latest' },
    'update-error.html': { path: 'src/renderer/update/error.html', kind: 'update-error' }
};

function resolveElectronPagePath(page, root = projectRoot) {
    const relativePath = pageDefinitions[page]?.path || page;
    return path.resolve(root, relativePath);
}

function inspectElectronPage(page, expectedTags = [], options = {}) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        if (options.query) env.PAGE_QUERY = JSON.stringify(options.query);
        if (options.screenshotPath) env.SCREENSHOT_PATH = path.resolve(options.screenshotPath);
        if (options.runInteractions === false) env.SKIP_PAGE_INTERACTIONS = '1';
        env.PAGE_KIND = options.pageKind || pageDefinitions[page]?.kind || '';

        const targetPagePath = options.absolutePagePath
            ? path.resolve(options.absolutePagePath)
            : resolveElectronPagePath(page);
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
    inspectElectronPage,
    resolveElectronPagePath
};
