const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.resolve(process.argv[2]);
const expectedTags = process.argv.slice(3);
const shouldRunInteractions = process.env.SKIP_PAGE_INTERACTIONS !== '1';
const updateInteractionStop = process.env.UPDATE_INTERACTION_STOP || '';

async function inspectPage() {
    const isSettingsPage = pagePath.endsWith('settings.html');
    const isHistoryPage = pagePath.endsWith('history.html');
    const isUpdatePage = [
        'update.html',
        'update-latest.html',
        'update-error.html'
    ].some(file => pagePath.endsWith(file));
    const window = new BrowserWindow({
        width: isSettingsPage ? 500 : 420,
        height: isSettingsPage ? 720 : (isUpdatePage ? 260 : 400),
        show: false,
        frame: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            partition: `lofi-page-smoke-${process.pid}`,
            offscreen:
                Boolean(process.env.SCREENSHOT_PATH)
                && process.env.NORMAL_RENDER_SCREENSHOT !== '1'
        }
    });

    const pageErrors = [];
    window.webContents.on('console-message', event => {
        if (event.level === 'warning' || event.level === 'error') {
            pageErrors.push(event.message);
            process.stderr.write(
                `PAGE_CONSOLE:${event.level}:${event.sourceId || 'unknown'}:${event.lineNumber || 0}:${event.message}\n`
            );
        }
    });
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        process.stderr.write(`PAGE_LOAD_FAILURE:${errorCode}:${errorDescription}:${validatedURL}\n`);
    });

    const query = process.env.PAGE_QUERY ? JSON.parse(process.env.PAGE_QUERY) : undefined;
    await window.loadFile(pagePath, query ? { query } : undefined);

    if (isHistoryPage) {
        await window.webContents.executeJavaScript(`
            (() => {
                const history = {};
                const now = new Date();
                [10, 20, 30, 40, 50, 60].forEach((value, index) => {
                    const date = new Date(now);
                    date.setDate(date.getDate() - (6 - index));
                    const key = date.getFullYear() + '-'
                        + String(date.getMonth() + 1).padStart(2, '0') + '-'
                        + String(date.getDate()).padStart(2, '0');
                    history[key] = value;
                });
                const todayKey = now.getFullYear() + '-'
                    + String(now.getMonth() + 1).padStart(2, '0') + '-'
                    + String(now.getDate()).padStart(2, '0');
                history[todayKey] = 25;
                localStorage.setItem('lofi-focus-history', JSON.stringify(history));
                localStorage.setItem('lofi-focus-time', JSON.stringify({
                    date: todayKey,
                    focusTime: 35
                }));
            })()
        `);
        const reloaded = new Promise(resolve => {
            window.webContents.once('did-finish-load', resolve);
        });
        window.webContents.reload();
        await reloaded;
    }

    const result = await window.webContents.executeJavaScript(`
        (async () => {
            const expectedTags = ${JSON.stringify(expectedTags)};
            const timeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timed out waiting for Web Awesome components')), 3000);
            });

            await Promise.race([
                Promise.all(expectedTags.map(tag => customElements.whenDefined(tag))),
                timeout
            ]);

            const externalResources = Array.from(
                document.querySelectorAll('link[rel="stylesheet"][href], script[src]')
            )
                .map(element => element.href || element.src)
                .filter(url => /^https?:/i.test(url));

            const initialBodyText = document.body.innerText;
            let interaction;
            const shouldRunInteractions = ${JSON.stringify(shouldRunInteractions)};
            const updateInteractionStop = ${JSON.stringify(updateInteractionStop)};
            if (shouldRunInteractions && location.pathname.endsWith('/update.html')) {
                let skippedVersion = null;
                let downloadCalls = 0;
                let installCalls = 0;
                let stateListener = null;
                window.updateAPI = {
                    download: () => {
                        downloadCalls += 1;
                    },
                    install: () => {
                        installCalls += 1;
                    },
                    onState: listener => {
                        stateListener = listener;
                    },
                    skip: version => {
                        skippedVersion = version;
                    }
                };
                stateListener = stateListener || window.applyUpdateState;
                document.getElementById('skipBtn').click();
                document.getElementById('downloadBtn').click();
                stateListener?.({
                    status: 'downloading',
                    percent: 42.4,
                    transferred: 40.7 * 1000 * 1000,
                    bytesPerSecond: 3.1 * 1000 * 1000,
                    total: 96 * 1000 * 1000
                });
                const downloadingText = document.body.innerText;
                const progressValue = document.getElementById('downloadProgress')?.value || null;
                const downloadAmountText = document.getElementById('downloadAmount')?.textContent.trim() || null;
                const downloadSpeedText = document.getElementById('downloadSpeed')?.textContent.trim() || null;
                const downloadSpeedCount = document.querySelectorAll('.download-speed').length;
                const downloadMetrics = document.getElementById('downloadMetrics');
                const downloadMetricsDisplay = downloadMetrics
                    ? getComputedStyle(downloadMetrics).display
                    : null;
                const downloadMetricsTextAlign = downloadMetrics
                    ? getComputedStyle(downloadMetrics).textAlign
                    : null;
                const downloadPanelRect = document.getElementById('downloadStatus')
                    ?.getBoundingClientRect();
                const downloadStatusTextRect = document.getElementById('downloadStatusText')
                    ?.getBoundingClientRect();
                const downloadMetricsRect = downloadMetrics?.getBoundingClientRect();
                const downloadMetricsRightGap = downloadPanelRect && downloadMetricsRect
                    ? Math.round(downloadPanelRect.right - downloadMetricsRect.right)
                    : null;
                const downloadStatusToMetricsGap = downloadStatusTextRect && downloadMetricsRect
                    ? Math.round(downloadMetricsRect.left - downloadStatusTextRect.right)
                    : null;
                if (updateInteractionStop !== 'downloading') {
                    stateListener?.({ status: 'downloaded', version: '1.4.0' });
                }
                const downloadedButtonText = document.getElementById('downloadBtn').textContent.trim();
                const downloadedBodyText = document.body.innerText;
                const downloadedHasOverflow =
                    document.documentElement.scrollHeight > document.documentElement.clientHeight;
                const downloadedActionsBottom = Math.round(
                    document.querySelector('.actions').getBoundingClientRect().bottom
                );
                if (!updateInteractionStop) {
                    document.getElementById('downloadBtn').click();
                }
                const installingText = document.body.innerText;
                const installingButtonText = document.getElementById('downloadBtn').textContent.trim();
                if (!updateInteractionStop) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                interaction = {
                    skippedVersion,
                    downloadCalls,
                    installCalls,
                    downloadingText,
                    progressValue,
                    downloadAmountText,
                    downloadSpeedText,
                    downloadSpeedCount,
                    downloadMetricsDisplay,
                    downloadMetricsTextAlign,
                    downloadMetricsRightGap,
                    downloadStatusToMetricsGap,
                    downloadedButtonText,
                    downloadedBodyText,
                    downloadedHasOverflow,
                    downloadedActionsBottom,
                    installingText,
                    installingButtonText
                };
            } else if (shouldRunInteractions && location.pathname.endsWith('/settings.html')) {
                const saved = {};
                let resolveLaunchAtStartup;
                window.settingsAPI = {
                    setLaunchAtStartup: enabled => {
                        saved.launchAtStartup = enabled;
                        return new Promise(resolve => {
                            resolveLaunchAtStartup = () => resolve({ enabled });
                        });
                    },
                    getShowTodayFocus: async () => true,
                    setShowTodayFocus: async enabled => {
                        saved.showTodayFocus = enabled;
                        return enabled;
                    },
                    setSubtitleConfig: config => {
                        saved.subtitleConfig = config;
                    }
                };

                const initialSubtitleMode =
                    document.querySelector('.capsule-option.active')?.dataset.mode || null;
                const todayFocusSwitch = document.getElementById('showTodayFocusToggle');
                const todayFocusInitiallyChecked =
                    todayFocusSwitch.getAttribute('aria-checked') === 'true';
                todayFocusSwitch.click();
                await Promise.resolve();
                await Promise.resolve();
                const todayFocusCheckedAfterToggle =
                    todayFocusSwitch.getAttribute('aria-checked') === 'true';
                const todayFocusSavedAfterToggle = saved.showTodayFocus;

                document.querySelector('[data-mode="greeting"]').click();
                document.getElementById('resetBtn').click();
                await Promise.resolve();
                await Promise.resolve();
                const resetSubtitleMode =
                    document.querySelector('.capsule-option.active')?.dataset.mode || null;
                const resetSubtitleConfig = saved.subtitleConfig
                    ? { ...saved.subtitleConfig }
                    : null;
                const todayFocusCheckedAfterReset =
                    todayFocusSwitch.getAttribute('aria-checked') === 'true';
                const todayFocusSavedAfterReset = saved.showTodayFocus;

                const launchSwitch = document.getElementById('launchAtStartupToggle');
                const launchStatus = document.getElementById('launchAtStartupStatus');
                const launchStatusBefore = launchStatus.textContent.trim();
                const launchStatusWidthBefore = launchStatus.getBoundingClientRect().width;
                launchSwitch.click();
                await Promise.resolve();
                const launchStatusPending = launchStatus.textContent.trim();
                const launchStatusWidthPending = launchStatus.getBoundingClientRect().width;
                const launchSwitchDisabledPending = launchSwitch.disabled;
                resolveLaunchAtStartup();
                await Promise.resolve();
                await Promise.resolve();
                const launchStatusAfter = launchStatus.textContent.trim();
                const launchSwitchDisabledAfter = launchSwitch.disabled;

                const shortcutInput = document.getElementById('playPauseShortcut');
                const defaultShortcutFont = getComputedStyle(shortcutInput).fontFamily;
                const bodyFont = getComputedStyle(document.body).fontFamily;
                shortcutInput.click();
                const recordingShortcutFont = getComputedStyle(shortcutInput).fontFamily;
                const recordingShortcutValue = shortcutInput.value;
                const recordingShortcutBorder = getComputedStyle(shortcutInput).borderColor;

                const customButton = document.querySelector('[data-mode="custom"]');
                customButton.click();

                const customInput = document.getElementById('subtitleCustomText');
                customInput.value = 'Deep focus';
                customInput.dispatchEvent(new Event('input', { bubbles: true }));

                interaction = {
                    saved,
                    initialSubtitleMode,
                    resetSubtitleMode,
                    resetSubtitleConfig,
                    todayFocusInitiallyChecked,
                    todayFocusCheckedAfterToggle,
                    todayFocusSavedAfterToggle,
                    todayFocusCheckedAfterReset,
                    todayFocusSavedAfterReset,
                    launchStatusBefore,
                    launchStatusPending,
                    launchStatusAfter,
                    launchStatusWidthBefore,
                    launchStatusWidthPending,
                    launchSwitchDisabledPending,
                    launchSwitchDisabledAfter,
                    activeMode: customButton.variant,
                    inactiveMode: document.querySelector('[data-mode="date"]').variant,
                    customInputDisplay: customInput.style.display,
                    defaultShortcutFont,
                    recordingShortcutFont,
                    bodyFont,
                    recordingShortcutValue,
                    recordingShortcutBorder
                };
            } else if (shouldRunInteractions && location.pathname.endsWith('/history.html')) {
                const initialPeriod = document.getElementById('summaryPeriod')?.textContent.trim() || null;
                const initialTotal = document.getElementById('summaryTotal')?.textContent.trim() || null;
                const initialToday = document.getElementById('summaryToday')?.textContent.trim() || null;
                const initialSummaryLabels = Array.from(
                    document.querySelectorAll('.summary-label'),
                    element => element.textContent.trim()
                );
                const monthButton = document.querySelector('[data-view="month"]');
                const tooltip = document.querySelector('.chart-tooltip');
                const hoverBar = bar => {
                    bar.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    bar.dispatchEvent(new MouseEvent('mousemove', {
                        bubbles: true,
                        clientX: 180,
                        clientY: 220
                    }));
                    return {
                        visible: tooltip.classList.contains('visible'),
                        html: tooltip.innerHTML
                    };
                };
                const weekTooltip = hoverBar(document.querySelector('.bar.today'));
                document.querySelector('.bar.today').dispatchEvent(
                    new MouseEvent('mouseleave', { bubbles: true })
                );
                monthButton.click();
                const monthTooltip = hoverBar(document.querySelector('.bar.today'));
                interaction = {
                    initialPeriod,
                    initialTotal,
                    initialToday,
                    initialSummaryLabels,
                    currentSummaryLabels: Array.from(
                        document.querySelectorAll('.summary-label'),
                        element => element.textContent.trim()
                    ),
                    currentPeriod: document.getElementById('summaryPeriod')?.textContent.trim() || null,
                    currentTotal: document.getElementById('summaryTotal')?.textContent.trim() || null,
                    activeView: monthButton.variant,
                    inactiveView: document.querySelector('[data-view="week"]').variant,
                    barCount: document.querySelectorAll('.bar-group').length,
                    todayBarTitle: document.querySelector('.bar.today')?.title || null,
                    weekTooltip,
                    monthTooltip
                };
            }

            await Promise.all(
                Array.from(document.querySelectorAll('wa-button, wa-input'))
                    .map(element => element.updateComplete)
            );
            await new Promise(resolve => requestAnimationFrame(resolve));
            await Promise.all(
                document.getAnimations()
                    .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
                    .map(animation => animation.finished.catch(() => undefined))
            );
            await new Promise(resolve => requestAnimationFrame(resolve));

            const sharedHeaderElement = document.querySelector('.subpage-header');
            const sharedProductLabel = sharedHeaderElement?.querySelector('.product-label');
            const sharedTitle = sharedHeaderElement?.querySelector('h1');
            const sharedCloseButton = sharedHeaderElement?.querySelector('.close-btn');
            const sharedHeader = sharedHeaderElement && sharedProductLabel && sharedTitle && sharedCloseButton
                ? (() => {
                    const labelRect = sharedProductLabel.getBoundingClientRect();
                    const titleRect = sharedTitle.getBoundingClientRect();
                    const closeRect = sharedCloseButton.getBoundingClientRect();
                    return {
                        productText: sharedProductLabel.textContent.trim(),
                        titleText: sharedTitle.textContent.trim(),
                        productLeft: Math.round(labelRect.left),
                        productTop: Math.round(labelRect.top),
                        productBottom: Math.round(labelRect.bottom),
                        productFontSize: getComputedStyle(sharedProductLabel).fontSize,
                        productFontFamily: getComputedStyle(sharedProductLabel).fontFamily,
                        titleLeft: Math.round(titleRect.left),
                        titleTop: Math.round(titleRect.top),
                        titleFontSize: getComputedStyle(sharedTitle).fontSize,
                        appRegion: getComputedStyle(sharedHeaderElement)
                            .getPropertyValue('app-region'),
                        webkitAppRegion: getComputedStyle(sharedHeaderElement)
                            .getPropertyValue('-webkit-app-region'),
                        closeTop: Math.round(closeRect.top),
                        closeRightGap: Math.round(document.documentElement.clientWidth - closeRect.right),
                        closeWidth: Math.round(closeRect.width),
                        closeHeight: Math.round(closeRect.height)
                    };
                })()
                : null;

            let layout;
            if (location.pathname.endsWith('/settings.html')) {
                const scrollArea = document.querySelector('.settings-scroll');
                const launchSwitch = document.getElementById('launchAtStartupToggle');
                const sectionTitle = document.querySelector('.setting-copy h2');
                const description = launchSwitch
                    ?.closest('.setting-row')
                    ?.querySelector('.setting-copy p');
                const hint = document.querySelector('.hint-text');
                const toggleWindowShortcut = document.getElementById('toggleWindowShortcut');
                const toggleWindowRow = toggleWindowShortcut?.closest('.shortcut-row');
                const toggleWindowCopy = toggleWindowRow?.querySelector('.setting-copy');
                const settingsButtonBase = document.querySelector('wa-button')?.shadowRoot
                    ?.querySelector('[part="base"]');
                const controlRect = launchSwitch.getBoundingClientRect();
                const thumb = launchSwitch.querySelector('.toggle-thumb');
                const thumbRect = thumb?.getBoundingClientRect();
                const footerRect = document.querySelector('.settings-footer').getBoundingClientRect();
                const lastSectionRect = scrollArea.lastElementChild.getBoundingClientRect();

                layout = {
                    hasVerticalOverflow: scrollArea.scrollHeight > scrollArea.clientHeight + 1,
                    scrollOverflowY: getComputedStyle(scrollArea).overflowY,
                    bodyScrollHeight: document.documentElement.scrollHeight,
                    viewportHeight: document.documentElement.clientHeight,
                    footerBottom: Math.round(footerRect.bottom),
                    lastSectionBottom: Math.round(lastSectionRect.bottom),
                    switchAriaLabel: launchSwitch.getAttribute('aria-label'),
                    switchStatus: document.getElementById('launchAtStartupStatus')?.textContent.trim() || null,
                    switchChecked: launchSwitch.getAttribute('aria-checked') === 'true',
                    switchControlBackground: getComputedStyle(launchSwitch).backgroundColor,
                    switchThumbOffset: thumbRect ? Math.round(thumbRect.left - controlRect.left) : null,
                    switchControlWidth: Math.round(controlRect.width),
                    switchControlHeight: Math.round(controlRect.height),
                    sectionTitleFontSize: sectionTitle
                        ? getComputedStyle(sectionTitle).fontSize
                        : null,
                    descriptionFontSize: description
                        ? getComputedStyle(description).fontSize
                        : null,
                    hintFontSize: hint ? getComputedStyle(hint).fontSize : null,
                    customInputPlaceholder:
                        document.getElementById('subtitleCustomText')?.placeholder || null,
                    toggleWindowHintInsideCopy:
                        Boolean(toggleWindowCopy && toggleWindowCopy.contains(hint)),
                    toggleWindowControlToCopyCenterDelta:
                        toggleWindowCopy && toggleWindowShortcut
                            ? Math.round(
                                (
                                    toggleWindowShortcut.getBoundingClientRect().top
                                    + toggleWindowShortcut.getBoundingClientRect().bottom
                                ) / 2
                                - (
                                    toggleWindowCopy.getBoundingClientRect().top
                                    + toggleWindowCopy.getBoundingClientRect().bottom
                                ) / 2
                            )
                            : null,
                    buttonFontSize: settingsButtonBase
                        ? getComputedStyle(settingsButtonBase).fontSize
                        : null
                };
            } else if (
                location.pathname.endsWith('/update.html')
                || location.pathname.endsWith('/update-latest.html')
                || location.pathname.endsWith('/update-error.html')
            ) {
                const message = document.querySelector('.message');
                const versionCaption = document.querySelector('.version-caption');
                const versionValue = document.querySelector('.version-value');
                const updateButton = document.querySelector('.btn');
                const currentBadge = document.querySelector('.current-badge');
                const informationPanel = document.querySelector('.version-rail, .status-panel');
                const actions = document.querySelector('.actions');
                const updateTitle = document.querySelector('.subpage-header h1');
                const informationPanelRect = informationPanel?.getBoundingClientRect();
                const actionsRect = actions?.getBoundingClientRect();
                const messageRect = message?.getBoundingClientRect();
                const updateTitleRect = updateTitle?.getBoundingClientRect();
                layout = {
                    viewportWidth: document.documentElement.clientWidth,
                    viewportHeight: document.documentElement.clientHeight,
                    hasOverflow:
                        document.documentElement.scrollWidth > document.documentElement.clientWidth
                        || document.documentElement.scrollHeight > document.documentElement.clientHeight,
                    stateKickerCount: document.querySelectorAll('.state-kicker').length,
                    productLabel: document.querySelector('.product-label')?.textContent.trim() || null,
                    messageFontSize: message ? getComputedStyle(message).fontSize : null,
                    versionCaptionFontSize: versionCaption
                        ? getComputedStyle(versionCaption).fontSize
                        : null,
                    versionValueFontSize: versionValue
                        ? getComputedStyle(versionValue).fontSize
                        : null,
                    buttonFontSize: updateButton
                        ? getComputedStyle(updateButton).fontSize
                        : null,
                    currentBadgeFontSize: currentBadge
                        ? getComputedStyle(currentBadge).fontSize
                        : null,
                    informationToActionsGap:
                        informationPanelRect && actionsRect
                            ? Math.round(actionsRect.top - informationPanelRect.bottom)
                            : null,
                    titleToMessageGap:
                        updateTitleRect && messageRect
                            ? Math.round(messageRect.top - updateTitleRect.bottom)
                            : null,
                    actionsBottomGap: actionsRect
                        ? Math.round(document.documentElement.clientHeight - actionsRect.bottom)
                        : null,
                    externalLinkIcons: Array.from(
                        document.querySelectorAll('.external-link-icon'),
                        icon => ({
                            buttonId: icon.closest('button')?.id || null,
                            ariaHidden: icon.getAttribute('aria-hidden'),
                            width: Math.round(icon.getBoundingClientRect().width),
                            height: Math.round(icon.getBoundingClientRect().height)
                        })
                    ),
                    versionBlocks: Array.from(document.querySelectorAll('.version-block'), element => {
                        const rect = element.getBoundingClientRect();
                        const style = getComputedStyle(element);
                        return {
                            text: element.innerText,
                            left: Math.round(rect.left),
                            right: Math.round(rect.right),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            display: style.display,
                            visibility: style.visibility,
                            opacity: style.opacity
                        };
                    })
                };
            } else if (location.pathname.endsWith('/history.html')) {
                const historyTitle = document.querySelector('.titlebar h1, .history-header h1');
                const summaryPanel = document.querySelector('.summary-panel');
                const summaryLabel = document.querySelector('.summary-label');
                const summaryValue = document.querySelector('.summary-value');
                const periodButtonBase = document.querySelector('.capsule-group wa-button')
                    ?.shadowRoot?.querySelector('[part="base"]');
                const barLabel = document.querySelector('.bar-label');
                const summaryValueStyles = Array.from(
                    document.querySelectorAll('.summary-value'),
                    element => {
                        const style = getComputedStyle(element);
                        return {
                            color: style.color,
                            fontSize: style.fontSize,
                            fontWeight: style.fontWeight
                        };
                    }
                );
                const visibleDate = Array.from(document.querySelectorAll('.bar-date'))
                    .find(element => !element.classList.contains('hidden-tick'));
                const historyPage = document.querySelector('.history-page');
                const capsuleGroup = document.querySelector('.capsule-group');
                const chartContainer = document.querySelector('.chart-container');
                layout = {
                    viewportWidth: document.documentElement.clientWidth,
                    viewportHeight: document.documentElement.clientHeight,
                    hasOverflow:
                        document.documentElement.scrollWidth > document.documentElement.clientWidth
                        || document.documentElement.scrollHeight > document.documentElement.clientHeight,
                    bodyFont: getComputedStyle(document.body).fontFamily,
                    productLabelCount: document.querySelectorAll('.product-label').length,
                    historyTitleTop: historyTitle
                        ? Math.round(historyTitle.getBoundingClientRect().top)
                        : null,
                    summaryPanelBackground: summaryPanel
                        ? getComputedStyle(summaryPanel).backgroundColor
                        : null,
                    summaryPanelBorderTopWidth: summaryPanel
                        ? getComputedStyle(summaryPanel).borderTopWidth
                        : null,
                    summaryPanelBorderRadius: summaryPanel
                        ? getComputedStyle(summaryPanel).borderRadius
                        : null,
                    summaryValueStyles,
                    summaryLabelFont: summaryLabel ? getComputedStyle(summaryLabel).fontFamily : null,
                    summaryValueFont: summaryValue ? getComputedStyle(summaryValue).fontFamily : null,
                    barDateFont: visibleDate ? getComputedStyle(visibleDate).fontFamily : null,
                    summaryLabelFontSize: summaryLabel
                        ? getComputedStyle(summaryLabel).fontSize
                        : null,
                    summaryValueFontSize: summaryValue
                        ? getComputedStyle(summaryValue).fontSize
                        : null,
                    periodButtonFontSize: periodButtonBase
                        ? getComputedStyle(periodButtonBase).fontSize
                        : null,
                    barLabelFontSize: barLabel
                        ? getComputedStyle(barLabel).fontSize
                        : null,
                    barDateFontSize: visibleDate
                        ? getComputedStyle(visibleDate).fontSize
                        : null,
                    historyPageAppRegion: historyPage
                        ? getComputedStyle(historyPage).getPropertyValue('app-region')
                        : null,
                    historyPageWebkitAppRegion: historyPage
                        ? getComputedStyle(historyPage).getPropertyValue('-webkit-app-region')
                        : null,
                    capsuleAppRegion: capsuleGroup
                        ? getComputedStyle(capsuleGroup).getPropertyValue('app-region')
                        : null,
                    capsuleWebkitAppRegion: capsuleGroup
                        ? getComputedStyle(capsuleGroup).getPropertyValue('-webkit-app-region')
                        : null,
                    chartAppRegion: chartContainer
                        ? getComputedStyle(chartContainer).getPropertyValue('app-region')
                        : null,
                    chartWebkitAppRegion: chartContainer
                        ? getComputedStyle(chartContainer).getPropertyValue('-webkit-app-region')
                        : null
                };
            }

            return {
                title: document.title,
                bodyText: document.body.innerText,
                initialBodyText,
                buttonIds: Array.from(document.querySelectorAll('button[id]'), button => button.id),
                externalResources,
                componentCounts: Object.fromEntries(
                    expectedTags.map(tag => [tag, document.querySelectorAll(tag).length])
                ),
                componentsDefined: Object.fromEntries(
                    expectedTags.map(tag => [tag, Boolean(customElements.get(tag))])
                ),
                sharedHeader,
                interaction,
                layout
            };
        })()
    `);

    if (process.env.SCREENSHOT_PATH) {
        await window.webContents.executeJavaScript(`
            Promise.all(
                Array.from(document.querySelectorAll('wa-button, wa-input'))
                    .map(element => element.updateComplete)
            ).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        `);
        const screenshot = await window.webContents.capturePage();
        fs.writeFileSync(process.env.SCREENSHOT_PATH, screenshot.toPNG());
    }

    window.destroy();
    return { ...result, pageErrors };
}

app.whenReady()
    .then(inspectPage)
    .then(result => {
        process.stdout.write(`PAGE_RESULT:${JSON.stringify(result)}\n`);
        app.quit();
    })
    .catch(error => {
        process.stderr.write(`${error.stack || error.message}\n`);
        app.exit(1);
    });
