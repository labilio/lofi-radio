const { app } = require('electron');
const path = require('node:path');
const { setLaunchAtStartup } = require(path.resolve(__dirname, '..', '..', 'startup-service'));

async function verifyWindowsStartupRegistration() {
    if (process.platform !== 'win32') {
        return { skipped: true, reason: 'Windows only' };
    }

    app.setAppUserModelId(`com.lofi-radio.startup-smoke.${process.pid}`);
    const runtime = {
        platform: 'win32',
        isPackaged: false,
        execPath: process.execPath,
        appPath: app.getAppPath()
    };
    let registered;
    let removed;

    try {
        registered = setLaunchAtStartup(app, true, runtime);
    } finally {
        removed = setLaunchAtStartup(app, false, runtime);
    }

    return {
        skipped: false,
        registered,
        removed
    };
}

app.whenReady()
    .then(verifyWindowsStartupRegistration)
    .then(result => {
        process.stdout.write(`STARTUP_RESULT:${JSON.stringify(result)}\n`);
        const passed = result.skipped
            || (
                result.registered.registered === true
                && result.registered.enabled === true
                && result.registered.executableWillLaunchAtLogin === true
                && result.registered.launchItem?.enabled === true
                && result.removed.registered === false
                && result.removed.enabled === false
            );
        app.exit(passed ? 0 : 1);
    })
    .catch(error => {
        process.stderr.write(`${error.stack || error.message}\n`);
        app.exit(1);
    });
