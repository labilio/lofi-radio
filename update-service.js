const API_URL = 'https://api.github.com/repos/labilio/lofi-radio/releases/latest';
const RELEASES_URL = 'https://github.com/labilio/lofi-radio/releases/latest';

class UpdateCheckError extends Error {
    constructor(reason, message, status) {
        super(message);
        this.name = 'UpdateCheckError';
        this.reason = reason;
        this.status = status;
    }
}

function normalizeVersion(value) {
    const version = String(value || '')
        .trim()
        .replace(/^v/i, '')
        .split('-')[0];

    if (!/^\d+(?:\.\d+)*$/.test(version)) {
        throw new UpdateCheckError('invalid-response', '版本信息格式不正确');
    }

    return version;
}

function compareVersions(left, right) {
    const leftParts = normalizeVersion(left).split('.').map(Number);
    const rightParts = normalizeVersion(right).split('.').map(Number);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index += 1) {
        const leftPart = leftParts[index] || 0;
        const rightPart = rightParts[index] || 0;
        if (leftPart > rightPart) return 1;
        if (leftPart < rightPart) return -1;
    }

    return 0;
}

function shouldSkipUpdateReminder({
    silent,
    latestVersion,
    skippedUpdateVersion
}) {
    if (!silent || typeof skippedUpdateVersion !== 'string') {
        return false;
    }

    try {
        return normalizeVersion(latestVersion) === normalizeVersion(skippedUpdateVersion);
    } catch {
        return false;
    }
}

function reasonForStatus(status) {
    if (status === 403 || status === 429) return 'rate-limited';
    if (status >= 500) return 'service-unavailable';
    return 'request-failed';
}

function messageForReason(reason) {
    const messages = {
        'rate-limited': 'GitHub 暂时限制了检查频率，请稍后再试。',
        offline: '网络连接不可用，请检查网络后重试。',
        timeout: '连接 GitHub 超时，请稍后重试。',
        'service-unavailable': 'GitHub 更新服务暂时不可用，请稍后再试。',
        'invalid-response': 'GitHub 返回了无法识别的版本信息。',
        'request-failed': '暂时无法连接更新服务，请稍后重试。'
    };

    return messages[reason] || messages['request-failed'];
}

function classifyError(error) {
    if (error instanceof UpdateCheckError) return error;
    if (error?.name === 'AbortError') {
        return new UpdateCheckError('timeout', messageForReason('timeout'));
    }
    if (error instanceof TypeError) {
        return new UpdateCheckError('offline', messageForReason('offline'));
    }
    return new UpdateCheckError('request-failed', messageForReason('request-failed'));
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetchImpl(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
}

function requestOptions(currentVersion) {
    return {
        redirect: 'follow',
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': `lofi-radio-player/${currentVersion}`
        }
    };
}

async function fetchApiRelease({ currentVersion, fetchImpl, timeoutMs }) {
    const response = await fetchWithTimeout(
        fetchImpl,
        API_URL,
        requestOptions(currentVersion),
        timeoutMs
    );

    if (!response.ok) {
        const reason = reasonForStatus(response.status);
        throw new UpdateCheckError(reason, messageForReason(reason), response.status);
    }

    const data = await response.json();
    const latestVersion = normalizeVersion(data.tag_name);
    if (!data.html_url) {
        throw new UpdateCheckError('invalid-response', messageForReason('invalid-response'));
    }

    return {
        latestVersion,
        releaseUrl: data.html_url
    };
}

async function fetchReleaseRedirect({ currentVersion, fetchImpl, timeoutMs }) {
    const response = await fetchWithTimeout(
        fetchImpl,
        RELEASES_URL,
        requestOptions(currentVersion),
        timeoutMs
    );

    if (!response.ok) {
        const reason = reasonForStatus(response.status);
        throw new UpdateCheckError(reason, messageForReason(reason), response.status);
    }

    const match = response.url.match(/\/releases\/tag\/v?([^/?#]+)/i);
    if (!match) {
        throw new UpdateCheckError('invalid-response', messageForReason('invalid-response'));
    }

    return {
        latestVersion: normalizeVersion(decodeURIComponent(match[1])),
        releaseUrl: response.url
    };
}

function errorResult(primaryError, fallbackError) {
    const errors = [classifyError(primaryError), classifyError(fallbackError)];
    const priority = [
        'rate-limited',
        'offline',
        'timeout',
        'service-unavailable',
        'invalid-response',
        'request-failed'
    ];
    const reason = priority.find(candidate => errors.some(error => error.reason === candidate))
        || 'request-failed';

    return {
        status: 'error',
        reason,
        message: messageForReason(reason)
    };
}

async function checkLatestRelease({
    currentVersion,
    fetchImpl = fetch,
    timeoutMs = 8000
}) {
    const normalizedCurrentVersion = normalizeVersion(currentVersion);
    let release;

    try {
        release = await fetchApiRelease({
            currentVersion: normalizedCurrentVersion,
            fetchImpl,
            timeoutMs
        });
    } catch (primaryError) {
        try {
            release = await fetchReleaseRedirect({
                currentVersion: normalizedCurrentVersion,
                fetchImpl,
                timeoutMs
            });
        } catch (fallbackError) {
            return errorResult(primaryError, fallbackError);
        }
    }

    return {
        status: compareVersions(release.latestVersion, normalizedCurrentVersion) > 0
            ? 'update-available'
            : 'up-to-date',
        currentVersion: normalizedCurrentVersion,
        latestVersion: release.latestVersion,
        releaseUrl: release.releaseUrl
    };
}

module.exports = {
    checkLatestRelease,
    compareVersions,
    normalizeVersion,
    shouldSkipUpdateReminder
};
