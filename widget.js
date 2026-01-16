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
        this.statusIndicator = this.createStatusIndicator();

        // 绑定事件
        this.bindEvents();

        // 初始化状态
        this.updatePlayButton();
        this.updateVolumeSlider();
        this.showStatus('系统就绪', 'ready');
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
            border: 1px solid rgba(255, 255, 255, 0.2);
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        document.body.appendChild(indicator);
        return indicator;
    }

    showStatus(message, type = 'info') {
        const colors = {
            loading: 'rgba(255, 165, 0, 0.9)', // 橙色
            ready: 'rgba(34, 197, 94, 0.9)',   // 绿色
            error: 'rgba(239, 68, 68, 0.9)',   // 红色
            info: 'rgba(59, 130, 246, 0.9)'    // 蓝色
        };

        this.statusIndicator.textContent = message;
        this.statusIndicator.style.backgroundColor = colors[type] || colors.info;
        this.statusIndicator.style.color = 'white';
        this.statusIndicator.style.opacity = '1';
    }

    hideStatus() {
        this.statusIndicator.style.opacity = '0';
    }

    bindEvents() {
        // #region agent log - Event binding start
        fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'initial',
            hypothesisId: 'EVENT_BINDING',
            location: 'widget.js:76',
            message: 'Starting event binding',
            data: {
              playPauseBtnFound: !!this.playPauseBtn,
              volumeSliderFound: !!this.volumeSlider,
              closeBtnFound: !!this.closeBtn,
              lofiWidgetAvailable: !!window.lofiWidget
            },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion

        // 播放/暂停按钮
        this.playPauseBtn.addEventListener('click', () => {
            // #region agent log - Play button clicked
            fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'initial',
                hypothesisId: 'BUTTON_CLICK',
                location: 'widget.js:78',
                message: 'Play/pause button clicked',
                data: { currentState: this.isPlaying, isReady: this.isReady },
                timestamp: Date.now()
              })
            }).catch(() => {});
            // #endregion
            this.togglePlayPause();
        });

        // 音量滑块
        this.volumeSlider.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            // #region agent log - Volume slider changed
            fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'initial',
                hypothesisId: 'VOLUME_SLIDER',
                location: 'widget.js:98',
                message: 'Volume slider changed',
                data: { newVolume: volume },
                timestamp: Date.now()
              })
            }).catch(() => {});
            // #endregion
            this.setVolume(volume);
        });

        // 关闭按钮
        this.closeBtn.addEventListener('click', () => {
            // #region agent log - Close button clicked
            fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'initial',
                hypothesisId: 'CLOSE_BUTTON',
                location: 'widget.js:113',
                message: 'Close button clicked',
                data: {},
                timestamp: Date.now()
              })
            }).catch(() => {});
            // #endregion
            this.closeApp();
        });

        // 监听来自主进程的状态变化
        if (window.lofiWidget) {
            window.lofiWidget.onPlayStateChange((isPlaying) => {
                // #region agent log - Play state changed callback
                fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: 'debug-session',
                    runId: 'initial',
                    hypothesisId: 'PLAY_STATE_CALLBACK',
                    location: 'widget.js:126',
                    message: 'Play state changed callback received',
                    data: { isPlaying },
                    timestamp: Date.now()
                  })
                }).catch(() => {});
                // #endregion
                this.isPlaying = isPlaying;
                this.updatePlayButton();
                this.updateVinylAnimation();
            });

            window.lofiWidget.onVolumeChange((volume) => {
                // #region agent log - Volume changed callback
                fetch('http://127.0.0.1:7242/ingest/7b916209-3140-4bbd-af5f-9e476231375a', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: 'debug-session',
                    runId: 'initial',
                    hypothesisId: 'VOLUME_CALLBACK',
                    location: 'widget.js:143',
                    message: 'Volume changed callback received',
                    data: { volume },
                    timestamp: Date.now()
                  })
                }).catch(() => {});
                // #endregion
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
            const statusText = this.isPlaying ? '播放中' : '已静音';
            this.showStatus(statusText, this.isPlaying ? 'ready' : 'error');
            setTimeout(() => this.hideStatus(), 1500);

            // 更新按钮图标提示
            this.playPauseBtn.title = this.isPlaying ? '点击静音' : '点击取消静音';
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
        const playIcon = this.playPauseBtn.querySelector('.play-icon');
        const pauseIcon = this.playPauseBtn.querySelector('.pause-icon');

        if (this.isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            this.playPauseBtn.classList.add('playing');
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            this.playPauseBtn.classList.remove('playing');
        }
    }

    updateVolumeSlider() {
        this.volumeSlider.value = this.currentVolume;
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