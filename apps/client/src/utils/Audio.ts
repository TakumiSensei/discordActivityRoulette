type NullableAudio = HTMLAudioElement | null;

class AudioManager {
  private bgm: NullableAudio = null;
  private roulette: NullableAudio = null;
  private success: NullableAudio = null;
  private initialized = false;
  private autoStartBound = false; // 互換のため残すが未使用

  init() {
    if (this.initialized) return;

    const bgmUrl = new URL('../../music/dorakuekajino.m4a', import.meta.url).href;
    const rouletteUrl = new URL('../../music/ルーレット.mp3', import.meta.url).href;
    const successUrl = new URL('../../music/成功音.mp3', import.meta.url).href;

    this.bgm = new Audio(bgmUrl);
    this.bgm.loop = true;
    this.bgm.preload = 'auto';
    this.bgm.volume = 0.05; // 音量を下げる

    this.roulette = new Audio(rouletteUrl);
    this.roulette.loop = true; // 回転中はループ
    this.roulette.preload = 'auto';
    this.roulette.volume = 0.05; // 音量を下げる

    this.success = new Audio(successUrl);
    this.success.preload = 'auto';
    this.success.volume = 0.05; // 音量を下げる

    this.initialized = true;
  }

  // 互換のためメソッドは残すが何もしない
  setupAutoStart() {}

  async startBGM() {
    if (!this.bgm) return;
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

