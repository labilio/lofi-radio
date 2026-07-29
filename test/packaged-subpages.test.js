const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { inspectElectronPage } = require('./electron-test-utils');

const runPackagedIntegration =
    process.env.RUN_PACKAGED_SUBPAGE_INTEGRATION === '1';
const packagedRoot = process.env.PACKAGED_SUBPAGE_ROOT
    ? path.resolve(process.env.PACKAGED_SUBPAGE_ROOT)
    : path.resolve(
        __dirname,
        '..',
        'dist_green',
        'win-unpacked',
        'resources',
        'app.asar'
    );

for (const scenario of [
    { page: 'settings.html', tags: ['wa-button', 'wa-input'] },
    { page: 'history.html', tags: ['wa-button'] }
]) {
    test(
        `packaged ${scenario.page} upgrades its local Web Awesome controls`,
        { skip: !runPackagedIntegration },
        async () => {
            const result = await inspectElectronPage(
                scenario.page,
                scenario.tags,
                {
                    absolutePagePath: path.join(packagedRoot, scenario.page)
                }
            );

            assert.deepEqual(result.externalResources, []);
            for (const tag of scenario.tags) {
                assert.equal(result.componentsDefined[tag], true);
                assert.ok(result.componentCounts[tag] > 0);
            }
            assert.deepEqual(
                result.pageErrors.filter(error => /SyntaxError|Unexpected string/.test(error)),
                []
            );
        }
    );
}
