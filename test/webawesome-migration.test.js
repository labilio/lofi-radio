const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspectElectronPage } = require('./electron-test-utils');

for (const scenario of [
    { page: 'settings.html', tags: ['wa-button', 'wa-input'] },
    { page: 'history.html', tags: ['wa-button'] }
]) {
    test(`${scenario.page} renders locally bundled Web Awesome controls`, async () => {
        const result = await inspectElectronPage(scenario.page, scenario.tags);

        assert.deepEqual(result.externalResources, [], 'page must not require network-hosted UI resources');
        for (const tag of scenario.tags) {
            assert.equal(result.componentsDefined[tag], true, `${tag} must be registered`);
            assert.ok(result.componentCounts[tag] > 0, `${tag} must render on the page`);
        }
        assert.deepEqual(
            result.pageErrors.filter(message => message.startsWith('[wa-')),
            [],
            'Web Awesome components must not emit migration or deprecation warnings'
        );
    });
}

test('settings Web Awesome controls keep saving and switching behavior', async () => {
    const result = await inspectElectronPage('settings.html', ['wa-button', 'wa-input']);

    assert.equal(result.interaction.initialSubtitleMode, 'date');
    assert.equal(result.interaction.resetSubtitleMode, 'date');
    assert.deepEqual(result.interaction.resetSubtitleConfig, {
        mode: 'date',
        customText: ''
    });
    assert.equal(result.interaction.saved.launchAtStartup, true);
    assert.equal(result.interaction.saved.subtitleConfig.customText, 'Deep focus');
    assert.equal(result.interaction.activeMode, 'brand');
    assert.equal(result.interaction.inactiveMode, 'neutral');
    assert.equal(result.interaction.customInputDisplay, 'block');
    assert.equal(result.interaction.todayFocusInitiallyChecked, true);
    assert.equal(result.interaction.todayFocusCheckedAfterToggle, false);
    assert.equal(result.interaction.todayFocusSavedAfterToggle, false);
    assert.equal(result.interaction.todayFocusCheckedAfterReset, true);
    assert.equal(result.interaction.todayFocusSavedAfterReset, true);
});

test('startup switch keeps its status label stable while Windows applies the change', async () => {
    const result = await inspectElectronPage('settings.html', ['wa-button', 'wa-input']);

    assert.equal(result.interaction.launchStatusBefore, '已关闭');
    assert.equal(result.interaction.launchStatusPending, '已关闭');
    assert.equal(
        result.interaction.launchStatusWidthPending,
        result.interaction.launchStatusWidthBefore
    );
    assert.equal(result.interaction.launchSwitchDisabledPending, true);
    assert.equal(result.interaction.launchStatusAfter, '已开启');
    assert.equal(result.interaction.launchSwitchDisabledAfter, false);
});

test('shortcut values keep their code font while Chinese recording copy uses the body font', async () => {
    const result = await inspectElectronPage('settings.html', ['wa-button', 'wa-input']);

    assert.match(result.interaction.defaultShortcutFont, /Cascadia Mono|Consolas|monospace/i);
    assert.notEqual(result.interaction.defaultShortcutFont, result.interaction.bodyFont);
    assert.equal(result.interaction.recordingShortcutFont, result.interaction.bodyFont);
    assert.equal(result.interaction.recordingShortcutValue, '请按组合键');
    assert.notEqual(result.interaction.recordingShortcutBorder, 'rgb(255, 122, 122)');
});

test('settings page stays compact and gives the startup switch a clear state', async () => {
    const result = await inspectElectronPage('settings.html', ['wa-button', 'wa-input']);

    assert.doesNotMatch(result.bodyText, /快捷键修改后需要保存/);
    assert.equal(result.layout.hasVerticalOverflow, false);
    assert.equal(result.layout.scrollOverflowY, 'visible');
    assert.ok(result.layout.bodyScrollHeight <= result.layout.viewportHeight + 1);
    assert.ok(result.layout.footerBottom <= result.layout.viewportHeight);
    assert.ok(result.layout.lastSectionBottom < result.layout.footerBottom);
    assert.equal(result.layout.switchAriaLabel, '开机自启');
    assert.equal(result.layout.switchStatus, '已开启');
    assert.equal(result.layout.switchControlWidth, 44);
    assert.equal(result.layout.switchControlHeight, 24);
    assert.equal(result.layout.switchControlBackground, 'rgb(74, 158, 255)');
    assert.equal(result.layout.switchChecked, true);
    assert.equal(result.layout.switchThumbOffset, 25);
});

test('Alt+W shortcut is centered against its title and tray description', async () => {
    const result = await inspectElectronPage('settings.html', ['wa-button', 'wa-input']);

    assert.equal(result.layout.toggleWindowHintInsideCopy, true);
    assert.ok(
        Math.abs(result.layout.toggleWindowControlToCopyCenterDelta) <= 1,
        `Alt+W control was offset by ${result.layout.toggleWindowControlToCopyCenterDelta}px`
    );
});

test('custom subtitle input explains that an empty value hides the subtitle', async () => {
    const result = await inspectElectronPage('settings.html', ['wa-button', 'wa-input']);

    assert.equal(result.layout.customInputPlaceholder, '留空则不显示副标题');
});

test('settings, update, and history share one aligned product header', async () => {
    const pages = [
        ['settings.html', ['wa-button', 'wa-input'], '偏好设置'],
        ['update-latest.html', [], '已是最新版本'],
        ['history.html', ['wa-button'], '专注历史']
    ];
    const results = [];

    for (const [page, tags, expectedTitle] of pages) {
        const result = await inspectElectronPage(page, tags);
        assert.ok(result.sharedHeader, `${page} must render the shared header`);
        assert.equal(result.sharedHeader.productText, 'LOFI RADIO');
        assert.equal(result.sharedHeader.titleText, expectedTitle);
        assert.equal(result.sharedHeader.productFontSize, '11px');
        assert.match(
            result.sharedHeader.productFontFamily,
            /Cascadia Mono|Consolas|monospace/i
        );
        assert.equal(result.sharedHeader.titleFontSize, '22px');
        assert.equal(result.sharedHeader.closeWidth, 32);
        assert.equal(result.sharedHeader.closeHeight, 32);
        assert.ok(result.sharedHeader.titleTop > result.sharedHeader.productBottom);
        results.push(result.sharedHeader);
    }

    const baseline = results[0];
    for (const header of results.slice(1)) {
        for (const property of [
            'productLeft',
            'productTop',
            'titleLeft',
            'titleTop',
            'closeTop',
            'closeRightGap'
        ]) {
            assert.ok(
                Math.abs(header[property] - baseline[property]) <= 1,
                `${property} differed by more than one rendered pixel`
            );
        }
    }
});

test('subpages use one readable typography scale for content and controls', async () => {
    const settings = await inspectElectronPage('settings.html', ['wa-button', 'wa-input']);
    assert.equal(settings.layout.sectionTitleFontSize, '14px');
    assert.equal(settings.layout.descriptionFontSize, '13px');
    assert.equal(settings.layout.hintFontSize, '11px');
    assert.equal(settings.layout.buttonFontSize, '13px');

    for (const page of ['update.html', 'update-latest.html', 'update-error.html']) {
        const update = await inspectElectronPage(page, []);
        assert.equal(update.layout.messageFontSize, '13px');
        assert.equal(update.layout.buttonFontSize, '13px');
        if (page !== 'update-error.html') {
            assert.equal(update.layout.versionCaptionFontSize, '11px');
            assert.equal(update.layout.versionValueFontSize, '13px');
        }
        if (page === 'update-latest.html') {
            assert.equal(update.layout.currentBadgeFontSize, '11px');
        }
    }

    const history = await inspectElectronPage('history.html', ['wa-button']);
    assert.equal(history.layout.summaryLabelFontSize, '12px');
    assert.equal(history.layout.summaryValueFontSize, '17px');
    assert.equal(history.layout.periodButtonFontSize, '13px');
    assert.equal(history.layout.barLabelFontSize, '10px');
    assert.equal(history.layout.barDateFontSize, '10px');
});

test('history Web Awesome controls switch to the 30-day view', async () => {
    const result = await inspectElectronPage('history.html', ['wa-button']);

    assert.equal(result.interaction.initialPeriod, '近 7 天累计');
    assert.equal(result.interaction.initialTotal, '245');
    assert.equal(result.interaction.initialToday, '35');
    assert.deepEqual(result.interaction.initialSummaryLabels, ['今日专注', '近 7 天累计']);
    assert.equal(result.interaction.currentPeriod, '近 30 天累计');
    assert.deepEqual(result.interaction.currentSummaryLabels, ['今日专注', '近 30 天累计']);
    assert.equal(result.interaction.currentTotal, '245');
    assert.equal(result.interaction.activeView, 'brand');
    assert.equal(result.interaction.inactiveView, 'neutral');
    assert.equal(result.interaction.barCount, 30);
    assert.match(
        result.interaction.monthTooltip.html,
        /\d+月\d+日<br>35 分钟/
    );
});

test('history uses the same custom tooltip in week and month views', async () => {
    const result = await inspectElectronPage('history.html', ['wa-button']);

    assert.equal(result.interaction.weekTooltip.visible, true);
    assert.equal(result.interaction.monthTooltip.visible, true);
    assert.equal(
        result.interaction.weekTooltip.html,
        result.interaction.monthTooltip.html
    );
    assert.equal(result.interaction.todayBarTitle, null);
});

test('history keeps Chinese copy readable while data uses a code font', async () => {
    const result = await inspectElectronPage('history.html', ['wa-button']);

    assert.ok(result.layout.viewportWidth >= 420 && result.layout.viewportWidth <= 422);
    assert.ok(result.layout.viewportHeight >= 400 && result.layout.viewportHeight <= 402);
    assert.equal(result.layout.hasOverflow, false);
    assert.equal(result.layout.summaryLabelFont, result.layout.bodyFont);
    assert.match(result.layout.summaryValueFont, /Cascadia Mono|Consolas|monospace/i);
    assert.match(result.layout.barDateFont, /Cascadia Mono|Consolas|monospace/i);
    assert.notEqual(result.layout.summaryValueFont, result.layout.bodyFont);
});

test('history keeps a generous drag region without disabling its controls', async () => {
    const result = await inspectElectronPage('history.html', ['wa-button']);

    assert.equal(result.layout.historyPageAppRegion, 'drag');
    assert.equal(result.layout.historyPageWebkitAppRegion, 'drag');
    assert.equal(result.layout.capsuleAppRegion, 'no-drag');
    assert.equal(result.layout.capsuleWebkitAppRegion, 'no-drag');
    assert.equal(result.layout.chartAppRegion, 'no-drag');
    assert.equal(result.layout.chartWebkitAppRegion, 'no-drag');
});

test('history uses one compact heading and presents today and period totals as equal facts', async () => {
    const result = await inspectElectronPage('history.html', ['wa-button']);

    assert.equal(result.layout.productLabelCount, 1);
    assert.equal(result.layout.summaryPanelBackground, 'rgba(0, 0, 0, 0)');
    assert.equal(result.layout.summaryPanelBorderTopWidth, '0px');
    assert.equal(result.layout.summaryPanelBorderRadius, '0px');
    assert.equal(result.layout.summaryValueStyles.length, 2);
    assert.deepEqual(result.layout.summaryValueStyles[0], result.layout.summaryValueStyles[1]);
});

test('history window opens at the viewport height required by the unified layout', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const historyWindowFactory = mainSource.slice(
        mainSource.indexOf('function createHistoryWindow()'),
        mainSource.indexOf('function loadStations()')
    );

    assert.match(historyWindowFactory, /width:\s*420,\s*\r?\n\s*height:\s*400,/);
});
