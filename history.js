class HistoryManager {
    constructor() {
        this.currentView = 'week';
        this.pollTimer = null;
        this.init();
    }

    init() {
        this.closeBtn = document.getElementById('closeBtn');
        this.viewToggle = document.getElementById('viewToggle');
        this.chartContainer = document.getElementById('chartContainer');
        this.summaryPeriod = document.getElementById('summaryPeriod');
        this.summaryTotal = document.getElementById('summaryTotal');
        this.summaryToday = document.getElementById('summaryToday');

        this.tooltip = document.createElement('div');
        this.tooltip.className = 'chart-tooltip';
        document.body.appendChild(this.tooltip);

        this.bindEvents();
        this.renderChart();
        this.startPolling();
    }

    bindEvents() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                if (window.historyAPI && window.historyAPI.closeWindow) {
                    window.historyAPI.closeWindow();
                }
            });
        }

        if (this.viewToggle) {
            this.viewToggle.addEventListener('click', (e) => {
                const btn = e.target.closest('.capsule-option');
                if (!btn) return;
                const view = btn.dataset.view;
                if (view === this.currentView) return;
                this.currentView = view;
                this.setActiveCapsule(view);
                this.renderChart();
            });
        }
    }

    setActiveCapsule(view) {
        this.viewToggle.querySelectorAll('.capsule-option').forEach(btn => {
            if (btn.dataset.view === view) {
                btn.variant = 'brand';
                btn.classList.add('active');
            } else {
                btn.variant = 'neutral';
                btn.classList.remove('active');
            }
        });
    }

    getHistory() {
        try {
            const stored = localStorage.getItem('lofi-focus-history');
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            return {};
        }
    }

    getTodayFocus() {
        try {
            const stored = localStorage.getItem('lofi-focus-time');
            if (stored) {
                const data = JSON.parse(stored);
                return data.focusTime || 0;
            }
        } catch (e) {}
        return 0;
    }

    getDateRange() {
        const dates = [];
        const days = this.currentView === 'week' ? 7 : 30;
        const now = new Date();

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            dates.push(d);
        }
        return dates;
    }

    formatDate(date) {
        return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0');
    }

    formatDateLabel(date) {
        return (date.getMonth() + 1) + '/' + date.getDate();
    }

    isTickVisible(index, total) {
        if (total <= 7) return true;
        // 首尾始终显示
        if (index === 0 || index === total - 1) return true;
        // 每隔 7 天，但与末尾至少保持 4 根柱子的间距
        if (index % 7 === 0 && total - 1 - index >= 4) return true;
        return false;
    }

    isToday(date) {
        const now = new Date();
        return date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();
    }

    renderChart() {
        // 周视图宽间距，月视图紧凑
        this.chartContainer.style.gap = this.currentView === 'week' ? '12px' : '4px';

        const history = this.getHistory();
        const dateRange = this.getDateRange();
        const todayStr = this.formatDate(new Date());
        const todayFocus = this.getTodayFocus();

        // 合并历史数据和今天实时的数据
        const values = dateRange.map(date => {
            const key = this.formatDate(date);
            if (key === todayStr) {
                return Math.max(history[key] || 0, todayFocus);
            }
            return history[key] || 0;
        });

        const maxVal = Math.max(...values, 1);
        const totalFocus = values.reduce((total, value) => total + value, 0);

        this.summaryPeriod.textContent =
            this.currentView === 'week' ? '近 7 天累计' : '近 30 天累计';
        this.summaryTotal.textContent = String(totalFocus);
        this.summaryToday.textContent = String(values[values.length - 1] || 0);

        this.chartContainer.innerHTML = '';

        dateRange.forEach((date, i) => {
            const value = values[i];
            const isTodayBar = this.isToday(date);
            const heightPercent = (value / maxVal) * 100;
            const total = dateRange.length;
            const isMonth = this.currentView === 'month';

            const group = document.createElement('div');
            group.className = 'bar-group';

            const wrapper = document.createElement('div');
            wrapper.className = 'bar-wrapper';

            const bar = document.createElement('div');
            bar.className = 'bar' + (isTodayBar ? ' today' : '');
            bar.style.height = Math.max(heightPercent, value > 0 ? 3 : 1) + '%';

            const label = document.createElement('div');
            label.className = 'bar-label';
            // 月视图隐藏数值标签，只留纯净柱子
            label.textContent = (!isMonth && value > 0) ? value + 'm' : '';

            const dateLabel = document.createElement('div');
            dateLabel.className = 'bar-date';
            if (this.isTickVisible(i, total)) {
                dateLabel.textContent = this.formatDateLabel(date);
            } else {
                dateLabel.classList.add('hidden-tick');
            }

            bar.addEventListener('mouseenter', () => {
                const dateStr = (date.getMonth() + 1) + '月' + date.getDate() + '日';
                this.tooltip.innerHTML = dateStr + '<br>' + value + ' 分钟';
                this.tooltip.classList.add('visible');
            });
            bar.addEventListener('mousemove', (e) => {
                const tw = this.tooltip.offsetWidth;
                const margin = 12;
                const left = e.clientX + tw + margin > window.innerWidth
                    ? e.clientX - tw - margin
                    : e.clientX + margin;
                this.tooltip.style.left = left + 'px';
                this.tooltip.style.top = (e.clientY - 36) + 'px';
            });
            bar.addEventListener('mouseleave', () => {
                this.tooltip.classList.remove('visible');
            });

            wrapper.appendChild(label);
            wrapper.appendChild(bar);
            group.appendChild(wrapper);
            group.appendChild(dateLabel);
            this.chartContainer.appendChild(group);
        });
    }

    startPolling() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => {
            this.renderChart();
        }, 30000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HistoryManager();
});
