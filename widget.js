// widget.js - 桌面小部件的交互逻辑

class LofiWidget {
    constructor() {
        this.isPlaying = true; // 默认播放状态（未静音）
        this.currentVolume = 0.3;
        this.isReady = false; // 标记音频是否准备好
        this.init();
    }

    init() {
        // 获取DOM元素
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.closeBtn = document.getElementById('closeBtn');
        this.vinylRecord = document.querySelector('.vinyl-record');
        this.widget = document.getElementById('widget');
        this.coverSection = document.querySelector('.cover-section');
        this.infoSection = document.querySelector('.info-section');
        this.statusIndicator = this.createStatusIndicator();


        // 绑定事件
        this.bindEvents();

        // 初始化状态
        this.updatePlayButton();
        this.updateVolumeSlider();
        this.showStatus('🎵 系统就绪', 'ready');
        setTimeout(() => this.hideStatus(), 2000);

        console.log('Lofi Widget initialized');
    }

    createStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'status-indicator';
        indicator.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 10px;
            padding: 4px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
            z-index: 1000;
            box-sizing: border-box;
        `;
        document.body.appendChild(indicator);
        return indicator;
    }

    showStatus(message, type = 'info') {
        const colors = {
            loading: 'rgba(255, 183, 77, 0.9)',  // 温暖橙色
            ready: 'rgba(255, 218, 185, 0.9)',   // 奶油色
            error: 'rgba(244, 67, 54, 0.9)',     // 柔和红色
            info: 'rgba(139, 92, 46, 0.9)'       // 复古棕色
        };

        this.statusIndicator.textContent = message;
        this.statusIndicator.style.backgroundColor = colors[type] || colors.info;
        this.statusIndicator.style.color = '#2a2a2a';
        this.statusIndicator.style.opacity = '1';
    }

    hideStatus() {
        this.statusIndicator.style.opacity = '0';
    }

    bindEvents() {
        // 播放/暂停按钮
        this.playPauseBtn.addEventListener('click', () => {
            this.togglePlayPause();
        });

        // 音量滑块
        this.volumeSlider.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            this.setVolume(volume);
        });

        // 关闭按钮
        this.closeBtn.addEventListener('click', () => {
            this.closeApp();
        });

        // 监听来自主进程的状态变化
        if (window.lofiWidget) {
            window.lofiWidget.onPlayStateChange((isPlaying) => {
                this.isPlaying = isPlaying;
                this.updatePlayButton();
                this.updateVinylAnimation();
            });

            window.lofiWidget.onVolumeChange((volume) => {
                this.currentVolume = volume;
                this.updateVolumeSlider();
            });
        }
    }

    togglePlayPause() {
        if (window.lofiWidget) {
            window.lofiWidget.togglePlayPause();
            // 立即更新UI状态（乐观更新）
            this.isPlaying = !this.isPlaying;
            this.updatePlayButton();
            this.updateVinylAnimation();

            // 显示状态反馈
            const statusText = this.isPlaying ? '♪ 正在播放' : '🔇 已静音';
            this.showStatus(statusText, this.isPlaying ? 'ready' : 'error');
            setTimeout(() => this.hideStatus(), 1500);

            // 更新唱片提示
            this.playPauseBtn.title = this.isPlaying ? '点击唱片暂停播放' : '点击唱片恢复播放';
        } else {
            this.showStatus('控制接口不可用', 'error');
            setTimeout(() => this.hideStatus(), 2000);
        }
    }

    setVolume(volume) {
        this.currentVolume = volume;
        if (window.lofiWidget) {
            window.lofiWidget.setVolume(volume);
            // 显示音量反馈
            const volumePercent = Math.round(volume * 100);
            this.showStatus(`音量: ${volumePercent}%`, 'info');
            setTimeout(() => this.hideStatus(), 1000);
        }
    }

    closeApp() {
        if (window.lofiWidget) {
            window.lofiWidget.closeApp();
        }
    }

    updatePlayButton() {
        if (this.isPlaying) {
            this.playPauseBtn.classList.add('playing');
        } else {
            this.playPauseBtn.classList.remove('playing');
        }
    }

    updateVolumeSlider() {
        this.volumeSlider.value = this.currentVolume;
        // 更新CSS变量用于进度条显示
        this.volumeSlider.style.setProperty('--value', `${this.currentVolume * 100}%`);
    }

    updateVinylAnimation() {
        if (this.isPlaying) {
            this.vinylRecord.classList.add('playing');
        } else {
            this.vinylRecord.classList.remove('playing');
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new LofiWidget();
});

// 全局错误处理
window.addEventListener('error', (e) => {
    console.error('Widget error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Widget unhandled rejection:', e.reason);
});