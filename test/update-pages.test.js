const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspectElectronPage } = require('./electron-test-utils');

const projectRoot = path.resolve(__dirname, '..');
const scenarios = [
    {
        page: 'update.html',
        query: { current: '1.3.0', latest: '1.4.0', url: 'https://example.com/v1.4.0' },
        copy: [/发现新版本/, /v1\.3\.0/, /v1\.4\.0/],
        buttons: ['closeBtn', 'downloadBtn', 'viewChangesBtn', 'skipBtn']
    },
    {
        page: 'update-latest.html',
        label: 'latest version',
        query: { current: '1.3.0' },
        copy: [/已是最新版本/, /v1\.3\.0/, /支持项目/],
        excludedCopy: [/查看发布页/, /查看更新内容/, /点个 Star/],
        buttons: ['closeBtn', 'okBtn', 'viewChangesBtn']
    },
    {
        page: 'update-latest.html',
        label: 'completed update',
        query: { current: '1.4.0', updated: '1' },
        copy: [/升级完成/, /已更新到 v1\.4\.0/, /升级成功/, /查看更新内容/],
        excludedCopy: [/已是最新版本/, /支持项目/],
        buttons: ['closeBtn', 'okBtn', 'viewChangesBtn']
    },
    {
        page: 'update-error.html',
        query: { reason: 'rate-limited' },
        copy: [/暂时无法检查更新/, /GitHub 暂时限制了检查频率/],
        buttons: ['closeBtn', 'retryBtn', 'viewChangesBtn']
    }
];

for (const scenario of scenarios) {
    test(`${scenario.label || scenario.page} uses the shared compact update shell`, async () => {
        const source = fs.readFileSync(path.join(projectRoot, scenario.page), 'utf8');
        const result = await inspectElectronPage(scenario.page, [], {
            query: scenario.query
        });

        assert.match(source, /<link[^>]+href=["']update\.css["']/i);
        assert.doesNotMatch(source, /<style[\s>]/i);
        assert.doesNotMatch(result.initialBodyText, /🎁|🚀/u);
        assert.match(result.initialBodyText, /LOFI RADIO/);
        assert.equal(result.layout.stateKickerCount, 0);
        assert.equal(result.layout.productLabel, 'LOFI RADIO');
        for (const expectedCopy of scenario.copy) {
            assert.match(result.initialBodyText, expectedCopy);
        }
        if (scenario.page === 'update.html') {
            assert.match(result.initialBodyText, /跳过此版本/);
            assert.doesNotMatch(result.initialBodyText, /不再提醒/);
            assert.equal(result.interaction.skippedVersion, '1.4.0');
            assert.equal(result.interaction.downloadCalls, 1);
            assert.equal(result.interaction.installCalls, 1);
            assert.match(result.interaction.downloadingText, /正在下载.*42%/);
            assert.equal(result.interaction.progressValue, 42.4);
            assert.equal(result.interaction.downloadAmountText, '40.7 MB / 96 MB');
            assert.equal(result.interaction.downloadSpeedText, null);
            assert.equal(result.interaction.downloadSpeedCount, 0);
            assert.equal(result.interaction.downloadMetricsDisplay, 'block');
            assert.equal(result.interaction.downloadMetricsTextAlign, 'right');
            assert.ok(
                result.interaction.downloadMetricsRightGap <= 14,
                `download amount left ${result.interaction.downloadMetricsRightGap}px on the right`
            );
            assert.ok(
                result.interaction.downloadStatusToMetricsGap >= 16,
                `download amount was only ${result.interaction.downloadStatusToMetricsGap}px from the percentage`
            );
            assert.equal(result.interaction.downloadedButtonText, '重启并安装');
            assert.equal(result.interaction.downloadedHasOverflow, false);
            assert.doesNotMatch(result.interaction.downloadedBodyText, /跳过此版本/);
            assert.ok(
                result.interaction.downloadedActionsBottom <= result.layout.viewportHeight - 16,
                `downloaded actions ended at ${result.interaction.downloadedActionsBottom}px`
            );
            assert.match(result.interaction.installingText, /接下来会显示安装进度/);
            assert.equal(result.interaction.installingButtonText, '正在准备…');
        }
        for (const excludedCopy of scenario.excludedCopy || []) {
            assert.doesNotMatch(result.bodyText, excludedCopy);
        }
        assert.deepEqual(result.externalResources, []);
        assert.deepEqual(result.buttonIds.sort(), scenario.buttons.sort());
        assert.deepEqual(result.layout.externalLinkIcons, [
            {
                buttonId: 'viewChangesBtn',
                ariaHidden: 'true',
                width: 14,
                height: 14
            }
        ]);
    });
}

test('all update states form one compact content group', async () => {
    for (const scenario of scenarios) {
        const result = await inspectElectronPage(scenario.page, [], {
            query: scenario.query,
            runInteractions: false
        });

        assert.ok(
            result.layout.viewportHeight >= 260 && result.layout.viewportHeight <= 262,
            `${scenario.page} viewport was ${result.layout.viewportHeight}px high`
        );
        assert.equal(result.layout.hasOverflow, false);
        assert.ok(
            result.layout.titleToMessageGap <= 18,
            `${scenario.page} left ${result.layout.titleToMessageGap}px below the title`
        );
        assert.equal(result.layout.informationToActionsGap, 16);
        assert.ok(
            result.layout.actionsBottomGap >= 16,
            `${scenario.page} left only ${result.layout.actionsBottomGap}px below the actions`
        );
    }
});

test('latest-version star button opens the repository while release buttons keep opening Releases', () => {
    const latestPage = fs.readFileSync(path.join(projectRoot, 'update-latest.html'), 'utf8');
    const preload = fs.readFileSync(path.join(projectRoot, 'update-preload.js'), 'utf8');
    const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');

    assert.match(latestPage, /updateAPI\?\.viewRepository\(\)/);
    assert.match(preload, /viewRepository[\s\S]*update-view-repository/);
    assert.match(
        main,
        /ipcMain\.on\(['"]update-view-repository['"][\s\S]*shell\.openExternal\(['"]https:\/\/github\.com\/labilio\/lofi-radio['"]\)/
    );
    assert.match(
        main,
        /ipcMain\.on\(['"]update-view-changes['"][\s\S]*shell\.openExternal\(['"]https:\/\/github\.com\/labilio\/lofi-radio\/releases['"]\)/
    );
});
