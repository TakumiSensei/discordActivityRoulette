type NullableAudio = HTMLAudioElement | null;

class AudioManager {
  private bgm: NullableAudio = null;
  private roulette: NullableAudio = null;
  private success: NullableAudio = null;
  private initialized = false;
  private autoStartBound = false;
  public enabled = true;

  init() {
    if (this.initialized) return;
    try { this.enabled = localStorage.getItem('roulette-sound') !== 'off'; } catch { /* Storage may be unavailable in an iframe. */ }

    const bgmUrl = new URL('../../music/dorakuekajino.m4a', import.meta.url).href;
    const rouletteUrl = new URL('../../music/ルーレット.mp3', import.meta.url).href;
    const successUrl = new URL('../../music/成功音.mp3', import.meta.url).href;

    this.bgm = new Audio(bgmUrl);
    this.bgm.loop = true;
    this.bgm.preload = 'auto';
    this.bgm.volume = 0.02; // 音量を下げる

    this.roulette = new Audio(rouletteUrl);
    this.roulette.loop = true; // 回転中はループ
    this.roulette.preload = 'auto';
    this.roulette.volume = 0.03; // 音量を下げる

    this.success = new Audio(successUrl);
    this.success.preload = 'auto';
    this.success.volume = 0.03; // 音量を下げる

    this.initialized = true;
    this.applyMute();
  }

  setupAutoStart() {
    if (this.autoStartBound) return;
    this.autoStartBound = true;
    const start = () => {
      if (this.enabled && this.bgm?.paused) this.startBGM().catch(() => {});
    };
    document.addEventListener('pointerdown', start);
    document.addEventListener('keydown', start);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    try { localStorage.setItem('roulette-sound', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    this.applyMute();
    if (enabled) this.startBGM().catch(() => {});
    else this.stopBGM();
  }

  private applyMute() {
    [this.bgm, this.roulette, this.success].forEach(audio => { if (audio) audio.muted = !this.enabled; });
  }

  async startBGM() {
    if (!this.bgm || !this.enabled) return;
    try {
      this.bgm.currentTime = this.bgm.currentTime || 0;
      await this.bgm.play();
    } catch (err) {
      // 再生不可（自動再生制限など）は呼び出し元で無視可能
      throw err;
    }
  }

  stopBGM() {
    if (!this.bgm) return;
    this.bgm.pause();
  }

  async playRoulette() {
    if (!this.roulette) return;
    try {
      this.roulette.currentTime = 0;
      await this.roulette.play();
    } catch {
      // 無視
    }
  }

  stopRoulette() {
    if (!this.roulette) return;
    this.roulette.pause();
    this.roulette.currentTime = 0;
  }

  async playSuccess() {
    if (!this.success) return;
    try {
      this.success.currentTime = 0;
      await this.success.play();
    } catch {
      // 無視
    }
  }
}

export const audioManager = new AudioManager();

