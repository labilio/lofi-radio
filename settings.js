function measureSettingsContentHeight() {
    const container = document.querySelector('.settings-container');
    const header = document.querySelector('.settings-header');
    const scrollArea = document.querySelector('.settings-scroll');
    const footer = document.querySelector('.settings-footer');
    const style = getComputedStyle(container);
    const scrollStyle = getComputedStyle(scrollArea);
    const verticalPadding =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const scrollBorders =
        parseFloat(scrollStyle.borderTopWidth) + parseFloat(scrollStyle.borderBottomWidth);
    const naturalScrollHeight = Array.from(scrollArea.children)
        .reduce((height, section) => height + section.getBoundingClientRect().height, scrollBorders);

    return Math.ceil(
        verticalPadding
        + header.scrollHeight
        + naturalScrollHeight
        + footer.scrollHeight
    );
}

class SettingsManager {
    constructor() {
        this.shortcuts = {
            playPause: 'Alt+Q',
            toggleWindow: ''
        };
        this.isRecording = false;
        this.currentTarget = null;
        this.init();
    }

    init() {
        this.playPauseInput = document.getElementById('playPauseShortcut');
        this.toggleWindowInput = document.getElementById('toggleWindowShortcut');
        this.launchAtStartupSwitch = document.getElementById('launchAtStartupToggle');
        this.launchAtStartupStatus = document.getElementById('launchAtStartupStatus');
        this.showTodayFocusSwitch = document.getElementById('showTodayFocusToggle');
        this.showTodayFocusStatus = document.getElementById('showTodayFocusStatus');
        this.subtitleModeGroup = document.getElementById('subtitleModeGroup');
        this.subtitleCustomText = document.getElementById('subtitleCustomText');
        this.recordingHint = document.getElementById('recordingHint');
        this.saveBtn = document.getElementById('saveBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.closeBtn = document.getElementById('closeBtn');

        this.loadSettings();
        this.bindEvents();
        this.autoFitWindow();
    }

    autoFitWindow() {
        Promise.all([
            customElements.whenDefined('wa-button'),
            customElements.whenDefined('wa-input')
        ]).then(() => {
            requestAnimationFrame(() => {
                const height = measureSettingsContentHeight();
                if (window.settingsAPI && window.settingsAPI.setContentHeight) {
                    window.settingsAPI.setContentHeight(height);
                }
            });
        });
    }

    async loadSettings() {
        if (window.settingsAPI && window.settingsAPI.getShortcuts) {
            const saved = await window.settingsAPI.getShortcuts();
            if (saved) {
                this.shortcuts = { ...this.shortcuts, ...saved };
            }
        }
        if (window.settingsAPI && window.settingsAPI.getLaunchAtStartup) {
            const status = await window.settingsAPI.getLaunchAtStartup();
            const enabled = typeof status === 'object' ? status.enabled : status;
            this.updateLaunchAtStartupStatus(Boolean(enabled));
        }
        if (window.settingsAPI && window.settingsAPI.getShowTodayFocus) {
            const enabled = await window.settingsAPI.getShowTodayFocus();
            this.updateShowTodayFocusStatus(enabled !== false);
        }
        if (window.settingsAPI && window.settingsAPI.getSubtitleConfig) {
            const config = await window.settingsAPI.getSubtitleConfig();
            const mode = config.mode || 'date';
            this.setActiveCapsule(mode);
            this.subtitleCustomText.value = config.customText || '';
            this.toggleCustomTextInput(mode);
        }
        this.updateInputs();
    }

    updateInputs() {
        this.playPauseInput.value = this.shortcuts.playPause || '';
        this.toggleWindowInput.value = this.shortcuts.toggleWindow || '';
    }

    bindEvents() {
        document.querySelectorAll('.shortcut-input').forEach(input => {
            input.addEventListener('click', (e) => {
                this.startRecording(e.target.id);
            });
        });

        document.getElementById('clearPlayPauseBtn').addEventListener('click', () => {
            this.clearShortcut('playPauseShortcut');
        });

        document.getElementById('clearToggleWindowBtn').addEventListener('click', () => {
            this.clearShortcut('toggleWindowShortcut');
        });

        document.addEventListener('keydown', (e) => {
            if (this.isRecording) {
                e.preventDefault();
                this.handleKeyPress(e);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (this.isRecording && e.key === 'Escape') {
                e.preventDefault();
                this.stopRecording();
            }
        });

        if (window.settingsAPI && window.settingsAPI.onPreventedWindowShortcutInput) {
            window.settingsAPI.onPreventedWindowShortcutInput((input) => {
                if (this.isRecording) {
                    this.handleKeyPress(input);
                }
            });
        }

        this.saveBtn.addEventListener('click', () => this.saveSettings());
        this.resetBtn.addEventListener('click', () => this.resetSettings());

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                if (window.settingsAPI && window.settingsAPI.closeWindow) {
                    window.settingsAPI.closeWindow();
                }
            });
        }

        if (this.launchAtStartupSwitch) {
            this.launchAtStartupSwitch.addEventListener('click', async () => {
                const enabled = this.launchAtStartupSwitch.getAttribute('aria-checked') !== 'true';
                const previousEnabled = !enabled;

                this.launchAtStartupSwitch.disabled = true;

                try {
                    if (!window.settingsAPI || !window.settingsAPI.setLaunchAtStartup) {
                        throw new Error('启动项接口不可用');
                    }

                    const status = await window.settingsAPI.setLaunchAtStartup(enabled);
                    const actualEnabled = typeof status === 'object' && status !== null
                        ? Boolean(status.enabled)
                        : enabled;

                    this.updateLaunchAtStartupStatus(actualEnabled);
                    if (status?.error || actualEnabled !== enabled) {
                        this.showToast(status?.error || 'Windows 未能启用此启动项', 'error');
                    }
                } catch (error) {
                    this.updateLaunchAtStartupStatus(previousEnabled);
                    this.showToast('开机自启设置失败，请重试', 'error');
                } finally {
                    this.launchAtStartupSwitch.disabled = false;
                }
            });
        }

        if (this.showTodayFocusSwitch) {
            this.showTodayFocusSwitch.addEventListener('click', async () => {
                const previousEnabled =
                    this.showTodayFocusSwitch.getAttribute('aria-checked') === 'true';
                const enabled = !previousEnabled;

                this.showTodayFocusSwitch.disabled = true;
                this.updateShowTodayFocusStatus(enabled);

                try {
                    if (!window.settingsAPI || !window.settingsAPI.setShowTodayFocus) {
                        throw new Error('专注计时显示设置接口不可用');
                    }

                    const savedEnabled = await window.settingsAPI.setShowTodayFocus(enabled);
                    this.updateShowTodayFocusStatus(savedEnabled !== false);
                } catch (error) {
                    this.updateShowTodayFocusStatus(previousEnabled);
                    this.showToast('专注计时显示设置失败，请重试', 'error');
                } finally {
                    this.showTodayFocusSwitch.disabled = false;
                }
            });
        }

        if (this.subtitleModeGroup) {
            this.subtitleModeGroup.addEventListener('click', (e) => {
                const btn = e.target.closest('.capsule-option');
                if (!btn) return;
                const mode = btn.dataset.mode;
                this.setActiveCapsule(mode);
                this.toggleCustomTextInput(mode);
                this.saveSubtitleConfig(mode, this.subtitleCustomText.value);
            });
        }

        if (this.subtitleCustomText) {
            this.subtitleCustomText.addEventListener('input', (e) => {
                this.saveSubtitleConfig(this.subtitleModeGroup.value, e.target.value);
            });
        }
    }

    setActiveCapsule(mode) {
        this.subtitleModeGroup.querySelectorAll('.capsule-option').forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.variant = 'brand';
                btn.classList.add('active');
            } else {
                btn.variant = 'neutral';
                btn.classList.remove('active');
            }
        });
    }

    updateLaunchAtStartupStatus(enabled) {
        if (this.launchAtStartupSwitch) {
            this.launchAtStartupSwitch.classList.toggle('is-checked', Boolean(enabled));
            this.launchAtStartupSwitch.setAttribute('aria-checked', String(Boolean(enabled)));
        }
        if (this.launchAtStartupStatus) {
            this.launchAtStartupStatus.textContent = enabled ? '已开启' : '已关闭';
        }
    }

    updateShowTodayFocusStatus(enabled) {
        if (this.showTodayFocusSwitch) {
            this.showTodayFocusSwitch.classList.toggle('is-checked', Boolean(enabled));
            this.showTodayFocusSwitch.setAttribute('aria-checked', String(Boolean(enabled)));
        }
        if (this.showTodayFocusStatus) {
            this.showTodayFocusStatus.textContent = enabled ? '已开启' : '已关闭';
        }
    }

    toggleCustomTextInput(mode) {
        if (this.subtitleCustomText) {
            const display = mode === 'custom' ? 'block' : 'none';
            if (this.subtitleCustomText.style.display === display) {
                return;
            }

            this.subtitleCustomText.style.display = display;
            requestAnimationFrame(() => this.autoFitWindow());
        }
    }

    saveSubtitleConfig(mode, customText) {
        if (window.settingsAPI && window.settingsAPI.setSubtitleConfig) {
            window.settingsAPI.setSubtitleConfig({ mode, customText });
        }
    }

    startRecording(targetId) {
        if (this.isRecording) {
            this.stopRecording();
        }

        this.isRecording = true;
        this.currentTarget = targetId;

        const input = document.getElementById(targetId);
        input.classList.add('recording');
        input.value = '请按组合键';

        this.recordingHint.classList.add('show');
    }

    stopRecording() {
        if (!this.isRecording) return;

        const input = document.getElementById(this.currentTarget);
        input.classList.remove('recording');

        this.recordingHint.classList.remove('show');
        this.updateInputs();

        this.isRecording = false;
        this.currentTarget = null;
    }

    clearShortcut(targetId) {
        if (targetId === 'playPauseShortcut') {
            this.shortcuts.playPause = '';
        } else if (targetId === 'toggleWindowShortcut') {
            this.shortcuts.toggleWindow = '';
        }

        const input = document.getElementById(targetId);
        input.value = '';
        this.showToast('快捷键已清空');
    }

    handleKeyPress(e) {
        if (e.key === 'Escape') {
            this.stopRecording();
            return;
        }

        const parts = [];

        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey) parts.push('Meta');

        let key = e.key;
        if (key === ' ') key = 'Space';
        else if (key === 'ArrowUp') key = 'Up';
        else if (key === 'ArrowDown') key = 'Down';
        else if (key === 'ArrowLeft') key = 'Left';
        else if (key === 'ArrowRight') key = 'Right';
        else if (key.length === 1) key = key.toUpperCase();
        else key = key;

        if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
            parts.push(key);
        }

        if (parts.length < 2) {
            this.showToast('请使用组合键（如 Alt+Q）', 'error');
            return;
        }

        const shortcut = parts.join('+');

        if (this.currentTarget === 'playPauseShortcut') {
            this.shortcuts.playPause = shortcut;
        } else if (this.currentTarget === 'toggleWindowShortcut') {
            this.shortcuts.toggleWindow = shortcut;
        }

        const input = document.getElementById(this.currentTarget);
        input.value = shortcut;

        this.stopRecording();
        this.showToast(`快捷键已设置为: ${shortcut}`);
    }

    async saveSettings() {
        if (window.settingsAPI && window.settingsAPI.saveShortcuts) {
            const result = await window.settingsAPI.saveShortcuts(this.shortcuts);
            if (result) {
                this.showToast('设置已保存，应用即将重启...');
            } else {
                this.showToast('保存失败，请重试', 'error');
            }
        }
    }

    resetSettings() {
        this.shortcuts = {
            playPause: 'Alt+Q',
            toggleWindow: ''
        };
        this.updateInputs();
        this.subtitleCustomText.value = '';
        this.setActiveCapsule('date');
        this.toggleCustomTextInput('date');
        this.saveSubtitleConfig('date', '');
        this.updateShowTodayFocusStatus(true);
        if (window.settingsAPI && window.settingsAPI.setShowTodayFocus) {
            window.settingsAPI.setShowTodayFocus(true).catch(() => {
                this.showToast('专注计时显示设置失败，请重试', 'error');
            });
        }
        this.showToast('已恢复默认设置');
    }

    showToast(message, type = 'success') {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
});

window.addEventListener('error', (e) => {
    console.error('Widget error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Widget unhandled rejection:', e.reason);
});
