function getRuntimeOptions(app, options = {}) {
    return {
        platform: options.platform || process.platform,
        execPath: options.execPath || process.execPath,
        appPath: options.appPath || app.getAppPath(),
        isPackaged: options.isPackaged ?? app.isPackaged
    };
}

function createLoginItemOptions({
    enabled,
    platform,
    isPackaged,
    execPath,
    appPath
}) {
    const settings = {
        openAtLogin: Boolean(enabled)
    };

    if (platform === 'win32') {
        settings.enabled = Boolean(enabled);

        if (!isPackaged) {
            settings.path = execPath;
            settings.args = [appPath];
        }
    }

    return settings;
}

function createLoginItemQueryOptions(runtime) {
    if (runtime.platform === 'win32' && !runtime.isPackaged) {
        return {
            path: runtime.execPath,
            args: [runtime.appPath]
        };
    }

    return {};
}

function commandValuesMatch(left, right) {
    return String(left || '')
        .replace(/^"(.*)"$/, '$1')
        .replace(/\//g, '\\')
        .toLowerCase() === String(right || '')
        .replace(/^"(.*)"$/, '$1')
        .replace(/\//g, '\\')
        .toLowerCase();
}

function getLaunchAtStartupStatus(app, options = {}) {
    const runtime = getRuntimeOptions(app, options);
    const query = createLoginItemQueryOptions(runtime);
    const settings = app.getLoginItemSettings(query);
    const matchingItem = runtime.platform === 'win32'
        ? settings.launchItems?.find(item =>
            commandValuesMatch(item.path, runtime.execPath)
            && item.args.length === (query.args || []).length
            && item.args.every((arg, index) => commandValuesMatch(arg, query.args[index]))
        )
        : undefined;
    const registered = Boolean(settings.openAtLogin || matchingItem);
    const enabled = runtime.platform === 'win32'
        ? Boolean(matchingItem
            ? matchingItem.enabled
            : registered && settings.executableWillLaunchAtLogin !== false)
        : registered;

    return {
        enabled,
        registered,
        executableWillLaunchAtLogin: settings.executableWillLaunchAtLogin,
        launchItem: matchingItem || null
    };
}

function setLaunchAtStartup(app, enabled, options = {}) {
    const runtime = getRuntimeOptions(app, options);
    app.setLoginItemSettings(createLoginItemOptions({
        enabled,
        ...runtime
    }));

    return getLaunchAtStartupStatus(app, runtime);
}

function initializeLaunchAtStartup(app, loadConfig, options = {}) {
    const config = loadConfig();
    return setLaunchAtStartup(app, Boolean(config.launchAtStartup), options);
}

module.exports = {
    createLoginItemOptions,
    getLaunchAtStartupStatus,
    initializeLaunchAtStartup,
    setLaunchAtStartup
};
