// renderer.js - 专注时长统计功能

class FocusTimeManager {
    constructor() {
        this.focusTime = 0; // 专注时长（分钟）
        this.isPlaying = true; // 默认播放状态
        this.timer = null;
        this.lastDate = null;
        this.init();
    }

    init() {
        this.loadFromStorage();
        this.checkDateReset();
        this.updateDisplay();
        this.bindEvents();
        this.startTimer();

        // 初始化时发送专注时间给主进程
        setTimeout(() => {
            if (window.electronAPI && window.electronAPI.sendFocusTime) {
                window.electronAPI.sendFocusTime(this.focusTime);
            }
        }, 500);

        console.log('FocusTimeManager initialized');
    }

    // 从localStorage加载数据
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('lofi-focus-time');
            if (stored) {
                const data = JSON.parse(stored);
                this.focusTime = data.focusTime || 0;
                this.lastDate = data.lastDate || this.getCurrentDate();
            } else {
                this.lastDate = this.getCurrentDate();
            }
        } catch (error) {
            console.error('Failed to load focus time from storage:', error);
            this.focusTime = 0;
            this.lastDate = this.getCurrentDate();
        }
    }

    // 保存到localStorage
    saveToStorage() {
        try {
            const data = {
                focusTime: this.focusTime,
                lastDate: this.lastDate
            };
            localStorage.setItem('lofi-focus-time', JSON.stringify(data));
            // 兜底归档
            this.archiveDate(this.lastDate, this.focusTime);
        } catch (error) {
            console.error('Failed to save focus time to storage:', error);
        }
    }

    // 获取当前日期字符串 (YYYY-MM-DD)
    getCurrentDate() {
        const now = new Date();
        return now.getFullYear() + '-' +
               String(now.getMonth() + 1).padStart(2, '0') + '-' +
               String(now.getDate()).padStart(2, '0');
    }

    // 检查是否需要重置（新的一天）
    checkDateReset() {
        const currentDate = this.getCurrentDate();
        if (this.lastDate !== currentDate) {
            console.log('New day detected, archiving yesterday and resetting');
            this.archiveDate(this.lastDate, this.focusTime);
            this.focusTime = 0;
            this.lastDate = currentDate;
            this.saveToStorage();
        }
    }

    // 归档每日专注数据到历史存储
    archiveDate(dateString, focusTimeValue) {
        if (!dateString || focusTimeValue <= 0) return;
        try {
            const stored = localStorage.getItem('lofi-focus-history');
            const history = stored ? JSON.parse(stored) : {};
            history[dateString] = focusTimeValue;
            // 清理 90 天前的记录
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 90);
            const cutoffStr = cutoff.getFullYear() + '-' +
                String(cutoff.getMonth() + 1).padStart(2, '0') + '-' +
                String(cutoff.getDate()).padStart(2, '0');
            Object.keys(history).forEach(key => {
                if (key < cutoffStr) delete history[key];
            });
            localStorage.setItem('lofi-focus-history', JSON.stringify(history));
            console.log('Focus time archived:', dateString, focusTimeValue, 'min');
        } catch (error) {
            console.error('Failed to archive focus time:', error);
        }
    }

    // 绑定事件监听器
    bindEvents() {
        // 延迟绑定，确保lofiWidget已经初始化
        setTimeout(() => {
            if (window.lofiWidget) {
                window.lofiWidget.onPlayStateChange((isPlaying) => {
                    this.isPlaying = isPlaying;
                    if (isPlaying) {
                        this.startTimer();
                    } else {
                        this.stopTimer();
                    }
                    console.log('Play state changed:', isPlaying ? 'playing' : 'paused');
                });
            } else {
                console.warn('lofiWidget not found, focus timer may not work properly');
            }
        }, 200);

        // 页面卸载时保存数据
        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });

        // 监听Mini模式变化
        this.observeMiniMode();

        // 每分钟检查一次日期（以防用户长时间运行）
        setInterval(() => {
            this.checkDateReset();
        }, 60000); // 60秒 = 1分钟
    }

    // 开始计时器
    startTimer() {
        if (this.timer) return; // 已经运行中

        this.timer = setInterval(() => {
            if (this.isPlaying) {
                this.focusTime++;
                this.updateDisplay();
                // 每分钟保存一次
                this.saveToStorage();
            }
        }, 60000); // 60秒 = 1分钟

        console.log('Focus timer started');
    }

    // 停止计时器
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('Focus timer stopped');
        }
    }

    // 监听Mini模式变化
    observeMiniMode() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const widget = document.getElementById('widget');
                    const isMiniMode = widget.classList.contains('mini-mode');

                    // Mini模式的按钮显示/隐藏由CSS控制，无需额外处理
                    console.log('Mini mode:', isMiniMode ? 'enabled' : 'disabled');
                }
            });
        });

        const widget = document.getElementById('widget');
        if (widget) {
            observer.observe(widget, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    // 更新显示
    updateDisplay() {
        const displayElement = document.getElementById('focusTime');
        if (displayElement) {
            displayElement.textContent = this.focusTime;
        }

        // 更新Mini模式的显示
        const miniDisplayElement = document.getElementById('miniFocusTime');
        if (miniDisplayElement) {
            miniDisplayElement.textContent = this.focusTime;
        }

        // 更新Widget的data属性（备用）
        const widget = document.getElementById('widget');
        if (widget) {
            widget.setAttribute('data-focus-text', `Focus: ${this.focusTime} min`);
        }

        // 发送给主进程更新托盘菜单
        if (window.electronAPI && window.electronAPI.sendFocusTime) {
            window.electronAPI.sendFocusTime(this.focusTime);
        }
    }

    // 获取当前专注时长
    getFocusTime() {
        return this.focusTime;
    }

    // 重置专注时长（用于测试）
    resetFocusTime() {
        this.focusTime = 0;
        this.lastDate = this.getCurrentDate();
        this.updateDisplay();
        this.saveToStorage();
        console.log('Focus time reset');
    }
}

// TODO: 测试完删除此种子函数
(function seedTestHistory() {
    const stored = localStorage.getItem('lofi-focus-history');
    const history = stored ? JSON.parse(stored) : {};
    // 合并写入，已有日期的数据不覆盖
    const seed = {
        '2026-05-18': 45,
        '2026-05-19': 120,
        '2026-05-20': 90,
        '2026-05-21': 150,
        '2026-05-22': 80,
        '2026-05-23': 110
    };
    let merged = false;
    Object.keys(seed).forEach(key => {
        if (!history[key]) {
            history[key] = seed[key];
            merged = true;
        }
    });
    if (merged) {
        localStorage.setItem('lofi-focus-history', JSON.stringify(history));
        console.log('Seeded test history data for May 18-23');
    } else {
        console.log('History seed skipped: all dates already exist');
    }
})();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 创建专注时长管理器实例
    window.focusTimeManager = new FocusTimeManager();
});

// 全局错误处理
window.addEventListener('error', (e) => {
    console.error('FocusTimeManager error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('FocusTimeManager unhandled rejection:', e.reason);
});