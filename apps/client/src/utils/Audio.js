var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class AudioManager {
    constructor() {
        this.bgm = null;
        this.roulette = null;
        this.success = null;
        this.initialized = false;
        this.autoStartBound = false; // 互換のため残すが未使用
    }
    init() {
        if (this.initialized)
            return;
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
    }
    // 互換のためメソッドは残すが何もしない
    setupAutoStart() { }
    startBGM() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.bgm)
                return;
            try {
                this.bgm.currentTime = this.bgm.currentTime || 0;
                yield this.bgm.play();
            }
            catch (err) {
                // 再生不可（自動再生制限など）は呼び出し元で無視可能
                throw err;
            }
        });
    }
    stopBGM() {
        if (!this.bgm)
            return;
        this.bgm.pause();
    }
    playRoulette() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.roulette)
                return;
            try {
                this.roulette.currentTime = 0;
                yield this.roulette.play();
            }
            catch (_a) {
                // 無視
            }
        });
    }
    stopRoulette() {
        if (!this.roulette)
            return;
        this.roulette.pause();
        this.roulette.currentTime = 0;
    }
    playSuccess() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.success)
                return;
            try {
                this.success.currentTime = 0;
                yield this.success.play();
            }
            catch (_a) {
                // 無視
            }
        });
    }
}
export const audioManager = new AudioManager();
