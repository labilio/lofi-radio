class LofiWidget {
    constructor() {
        this.isPlaying = true;
        this.currentVolume = 0.3;
        this.previousVolume = 0.3;
        this.isMuted = false;
        this.isReady = false;
        this.isStationListOpen = false;
        this.init();
    }

    init() {
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeIcon = document.querySelector('.volume-icon');
        this.closeBtn = document.getElementById('closeBtn');
        this.miniModeBtn = document.getElementById('miniModeBtn');
        this.miniPlayBtn = document.getElementById('miniPlayBtn');
        this.miniExpandBtn = document.getElementById('miniExpandBtn');
        this.vinylRecord = document.querySelector('.vinyl-record');
        this.widget = document.getElementById('widget');
        this.coverSection = document.querySelector('.cover-section');
        this.infoSection = document.querySelector('.info-section');
        this.focusTimeDisplay = document.querySelector('.focus-time-display');
        this.statusIndicator = this.createStatusIndicator();
        this.isMiniMode = false;

        this.stationListBtn = document.getElementById('stationListBtn');
        this.stationListPanel = document.getElementById('stationListPanel');
        this.stationListUl = document.getElementById('stationListUl');
        this.stationTitle = document.getElementById('stationTitle');
        this.panelBackBtn = document.getElementById('panelBackBtn');

        this.bindEvents();

        if (window.lofiWidget && window.lofiWidget.getStations) {
            window.lofiWidget.getStations();
        }

        this.updatePlayButton();
        this.showStatus('🎵 系统就绪', 'ready');
        setTimeout(() => this.hideStatus(), 2000);

        console.log('Lofi Widget initialized');

        setTimeout(() => {
            if (window.focusTimeManager) {
                window.focusTimeManager.isPlaying = this.isPlaying;
                if (this.isPlaying) {
                    window.focusTimeManager.startTimer();
                }
            }
        }, 100);
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
            z-index: 50;
            box-sizing: border-box;
        `;
        this.widget.appendChild(indicator);
        return indicator;
    }

    showStatus(message, type = 'info') {
        if (this.isMiniMode) {
            return;
        }

        const colors = {
            loading: 'rgba(255, 183, 77, 0.9)',
            ready: 'rgba(255, 218, 185, 0.9)',
            error: 'rgba(244, 67, 54, 0.9)',
            info: 'rgba(255, 218, 185, 0.9)'
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
        this.playPauseBtn.addEventListener('click', () => {
            this.togglePlayPause();
        });

        this.volumeSlider.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            this.setVolume(volume);
        });

        if (this.volumeIcon) {
            this.volumeIcon.addEventListener('click', () => {
                this.toggleMute();
            });
            this.volumeIcon.style.cursor = 'pointer';
        }

        this.miniModeBtn.addEventListener('click', () => {
            this.toggleMiniMode();
        });

        this.miniPlayBtn.addEventListener('click', () => {
            this.togglePlayPause();
        });

        this.miniExpandBtn.addEventListener('click', () => {
            this.toggleMiniMode();
        });

        this.closeBtn.addEventListener('click', () => {
            this.closeApp();
        });

        if (this.stationListBtn) {
            this.stationListBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleStationList();
            });
        }

        if (this.panelBackBtn) {
            this.panelBackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleStationList(false);
            });
        }

        document.addEventListener('click', (e) => {
            if (this.isStationListOpen && 
                this.stationListPanel && 
                !this.stationListPanel.contains(e.target) && 
                e.target !== this.stationListBtn) {
                this.toggleStationList(false);
            }
        });

        if (window.lofiWidget) {
            window.lofiWidget.onPlayStateChange((isPlaying) => {
                const wasPlaying = this.isPlaying;
                this.isPlaying = isPlaying;
                this.updatePlayButton();
                this.updateVinylAnimation();

                if (wasPlaying !== isPlaying && !this.isMiniMode) {
                    const statusText = this.isPlaying ? '♪ 正在播放' : '🔇 已静音';
                    this.showStatus(statusText, this.isPlaying ? 'ready' : 'error');
                    setTimeout(() => this.hideStatus(), 1500);
                }
            });

            window.lofiWidget.onVolumeChange((volume) => {
                this.currentVolume = volume;
                this.updateVolumeSlider();
            });

            if (window.lofiWidget.onStationsList) {
                window.lofiWidget.onStationsList((stations) => {
                    this.updateStationList(stations);
                });
            }

            if (window.lofiWidget.onStationChanged) {
                window.lofiWidget.onStationChanged((station, index) => {
                    this.updateCurrentStation(station, index);
                });
            }
        }
    }

    toggleStationList(forceState = null) {
        if (forceState !== null) {
            this.isStationListOpen = forceState;
        } else {
            this.isStationListOpen = !this.isStationListOpen;
        }

        if (this.isStationListOpen) {
            this.stationListPanel.classList.add('active');
            this.widget.classList.add('list-open');
            
            if (this.stationListUl && this.stationListUl.children.length === 0) {
                console.log('Station list is empty, requesting stations...');
                if (window.lofiWidget && window.lofiWidget.getStations) {
                    window.lofiWidget.getStations();
                }
            }
        } else {
            this.stationListPanel.classList.remove('active');
            this.widget.classList.remove('list-open');
        }
    }

    updateStationList(stations) {
        if (!this.stationListUl) return;
        
        this.stationListUl.innerHTML = '';
        stations.forEach((station, index) => {
            const li = document.createElement('li');
            li.className = 'station-list-item';
            li.dataset.index = index;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'station-name';
            nameSpan.textContent = station.name;
            
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'station-tags';
            
            if (station.style1) {
                const tag1 = document.createElement('span');
                tag1.className = 'station-tag';
                tag1.textContent = station.style1;
                tagsContainer.appendChild(tag1);
            }
            
            if (station.style2) {
                const tag2 = document.createElement('span');
                tag2.className = 'station-tag';
                tag2.textContent = station.style2;
                tagsContainer.appendChild(tag2);
            }
            
            if (station.custom) {
                const customTag = document.createElement('span');
                customTag.className = 'station-tag custom-tag';
                customTag.textContent = station.custom;
                tagsContainer.appendChild(customTag);
            }
            
            if (station.scene) {
                const sceneTag = document.createElement('span');
                sceneTag.className = 'station-tag scene-tag';
                sceneTag.textContent = station.scene;
                tagsContainer.appendChild(sceneTag);
            }
            
            li.appendChild(nameSpan);
            li.appendChild(tagsContainer);
            
            li.addEventListener('click', () => {
                if (window.lofiWidget && window.lofiWidget.changeStation) {
                    window.lofiWidget.changeStation(index);
                    this.toggleStationList(false);
                }
            });
            
            this.stationListUl.appendChild(li);
        });
    }

    updateCurrentStation(station, index) {
        if (this.stationListUl) {
            const items = this.stationListUl.querySelectorAll('.station-list-item');
            items.forEach(item => item.classList.remove('active'));
            if (items[index]) {
                items[index].classList.add('active');
            }
        }
        
        if (this.stationTitle) {
            this.stationTitle.textContent = station.name;
        }

        if (!this.isMiniMode) {
            this.showStatus(`正在播放: ${station.name}`, 'ready');
            setTimeout(() => this.hideStatus(), 1500);
        }
    }

    togglePlayPause() {
        if (window.lofiWidget) {
            window.lofiWidget.togglePlayPause();
            this.isPlaying = !this.isPlaying;
            this.updatePlayButton();
            this.updateVinylAnimation();

            const statusText = this.isPlaying ? '♪ 正在播放' : '🔇 已静音';
            this.showStatus(statusText, this.isPlaying ? 'ready' : 'error');
            setTimeout(() => this.hideStatus(), 1500);

            this.playPauseBtn.title = this.isPlaying ? '点击唱片暂停播放' : '点击唱片恢复播放';
        } else {
            this.showStatus('控制接口不可用', 'error');
            setTimeout(() => this.hideStatus(), 2000);
        }
    }

    setVolume(volume) {
        this.currentVolume = volume;
        if (volume > 0) {
            this.previousVolume = volume;
            this.isMuted = false;
        } else {
            this.isMuted = true;
        }
        this.updateVolumeIcon();
        if (window.lofiWidget) {
            window.lofiWidget.setVolume(volume);
            const volumePercent = Math.round(volume * 100);
            this.showStatus(`音量: ${volumePercent}%`, 'info');
            setTimeout(() => this.hideStatus(), 1000);
        }
    }

    toggleMute() {
        if (this.isMuted) {
            this.currentVolume = this.previousVolume > 0 ? this.previousVolume : 0.3;
            this.isMuted = false;
        } else {
            this.previousVolume = this.currentVolume > 0 ? this.currentVolume : 0.3;
            this.currentVolume = 0;
            this.isMuted = true;
        }
        this.updateVolumeSlider();
        this.updateVolumeIcon();
        if (window.lofiWidget) {
            window.lofiWidget.setVolume(this.currentVolume);
            const statusText = this.isMuted ? '🔇 已静音' : `音量: ${Math.round(this.currentVolume * 100)}%`;
            this.showStatus(statusText, this.isMuted ? 'error' : 'info');
            setTimeout(() => this.hideStatus(), 1000);
        }
    }

    updateVolumeIcon() {
        if (!this.volumeIcon) return;
        
        if (this.isMuted || this.currentVolume === 0) {
            this.volumeIcon.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
            this.volumeIcon.classList.add('muted');
        } else {
            this.volumeIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>`;
            this.volumeIcon.classList.remove('muted');
        }
    }

    toggleMiniMode() {
        if (window.electronAPI && window.electronAPI.toggleMiniMode) {
            this.widget.style.opacity = '0';
            this.widget.style.transition = 'opacity 0.15s ease-out';

            setTimeout(() => {
                window.electronAPI.toggleMiniMode();

                setTimeout(() => {
                    this.isMiniMode = !this.isMiniMode;
                    this.updateMiniModeUI();

                    this.widget.style.opacity = '1';
                }, 150);
            }, 150);
        }
    }

    updateMiniModeUI() {
        if (this.isMiniMode) {
            this.widget.classList.add('mini-mode');
        } else {
            this.widget.classList.remove('mini-mode');
        }
        this.updatePlayButton();
    }

    closeApp() {
        if (window.lofiWidget) {
            window.lofiWidget.closeApp();
        }
    }

    updatePlayButton() {
        if (this.isPlaying) {
            this.playPauseBtn.classList.add('playing');
            if (this.isMiniMode) {
                this.miniPlayBtn.classList.add('playing');
            }
        } else {
            this.playPauseBtn.classList.remove('playing');
            if (this.isMiniMode) {
                this.miniPlayBtn.classList.remove('playing');
            }
        }
    }

    updateVolumeSlider() {
        this.volumeSlider.value = this.currentVolume;
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

document.addEventListener('DOMContentLoaded', () => {
    new LofiWidget();
});

window.addEventListener('error', (e) => {
    console.error('Widget error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Widget unhandled rejection:', e.reason);
});
