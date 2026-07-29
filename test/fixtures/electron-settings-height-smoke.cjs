const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { resizeFixedWindow } = require(path.resolve(__dirname, '..', '..', 'window-sizing'));

const settingsPath = path.resolve(__dirname, '..', '..', 'settings.html');
const heightMessagePrefix = 'LOFI_SETTINGS_HEIGHT:';

async function waitForLayout(window) {
    await window.webContents.executeJavaScript(`
        Promise.all([
            customElements.whenDefined('wa-button'),
            customElements.whenDefined('wa-input')
        ]).then(() => Promise.all(
            Array.from(document.querySelectorAll('wa-button, wa-input'))
                .map(element => element.updateComplete)
        )).then(() => new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        }))
    `);
    await new Promise(resolve => setTimeout(resolve, 80));
}

async function inspectSettingsHeight() {
    const window = new BrowserWindow({
        width: 500,
        height: 560,
        show: false,
        frame: false,
        resizable: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const requestedHeights = [];
    const appliedWindowHeights = [];
    window.webContents.on('console-message', event => {
        if (!event.message.startsWith(heightMessagePrefix)) return;

        const requestedHeight = Number(event.message.slice(heightMessagePrefix.length));
        requestedHeights.push(requestedHeight);
        const height = Math.max(440, Math.ceil(requestedHeight));
        resizeFixedWindow(window, 500, height);
        appliedWindowHeights.push(window.getBounds().height);
    });

    await window.loadFile(settingsPath);
    await window.webContents.executeJavaScript(`
        window.settingsAPI = {
            setContentHeight: height => console.log('${heightMessagePrefix}' + height),
            setSubtitleConfig: () => {}
        };
        true;
    `);
    await waitForLayout(window);
    await window.webContents.executeJavaScript(`
        window.settingsAPI.setContentHeight(measureSettingsContentHeight())
    `);
    await waitForLayout(window);

    const samples = [];
    for (const mode of ['date', 'greeting', 'date', 'greeting', 'custom', 'date', 'custom', 'date']) {
        const requestStart = requestedHeights.length;
        const appliedStart = appliedWindowHeights.length;
        await window.webContents.executeJavaScript(`
            document.querySelector('[data-mode="${mode}"]').click()
        `);
        await waitForLayout(window);

        const layout = await window.webContents.executeJavaScript(`
            (() => {
                const container = document.querySelector('.settings-container');
                return {
                    documentScrollHeight: document.documentElement.scrollHeight,
                    documentClientHeight: document.documentElement.clientHeight,
                    containerHeight: Math.ceil(container.getBoundingClientRect().height)
                };
            })()
        `);

        samples.push({
            mode,
            windowHeight: window.getBounds().height,
            contentHeight: window.getContentBounds().height,
            minimumHeight: window.getMinimumSize()[1],
            requestedHeights: requestedHeights.slice(requestStart),
            appliedWindowHeights: appliedWindowHeights.slice(appliedStart),
            ...layout
        });
    }

    window.destroy();
    return samples;
}

app.whenReady()
    .then(inspectSettingsHeight)
    .then(samples => {
        process.stdout.write(`HEIGHT_RESULT:${JSON.stringify(samples)}\n`);
        app.quit();
    })
    .catch(error => {
        process.stderr.write(`${error.stack || error.message}\n`);
        app.exit(1);
    });
