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
            customElements.whenDefined('sl-switch'),
            customElements.whenDefined('sl-button'),
            customElements.whenDefined('sl-input')
        ]).then(() => {
            requestAnimationFrame(() => {
                const height = document.documentElement.scrollHeight;
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
            const enabled = await window.settingsAPI.getLaunchAtStartup();
            this.launchAtStartupSwitch.checked = enabled;
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
            this.launchAtStartupSwitch.addEventListener('sl-change', (e) => {
                const enabled = e.target.checked;
                if (window.settingsAPI && window.settingsAPI.setLaunchAtStartup) {
                    window.settingsAPI.setLaunchAtStartup(enabled);
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
                this.autoFitWindow();
            });
        }

        if (this.subtitleCustomText) {
            this.subtitleCustomText.addEventListener('sl-input', (e) => {
                this.saveSubtitleConfig(this.subtitleModeGroup.value, e.target.value);
            });
        }
    }

    setActiveCapsule(mode) {
        this.subtitleModeGroup.querySelectorAll('.capsule-option').forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.variant = 'primary';
                btn.classList.add('active');
            } else {
                btn.variant = 'default';
                btn.classList.remove('active');
            }
        });
    }

    toggleCustomTextInput(mode) {
        if (this.subtitleCustomText) {
            this.subtitleCustomText.style.display = (mode === 'custom') ? 'block' : 'none';
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
        input.value = '按下快捷键...';

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
