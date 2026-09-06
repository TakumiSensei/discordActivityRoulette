import { Room } from 'colyseus.js';
import { colyseusSDK } from '../utils/Colyseus.js';
import { discordSDK } from '../utils/DiscordSDK.js';
import { authenticate } from '../utils/Auth.js';
import { audioManager } from '../utils/Audio.js';
import { RouletteUI } from '../ui/RouletteUI.js';
import { RouletteAnimation } from './RouletteAnimation.js';

interface RouletteState {
    items: string[];
    isSpinning: boolean;
    targetRotation: number;
    spinId: number;
    spinStartedAt: number;
    resultItem: string;
    history: string[][];
}

export class RouletteGame {
    private room: Room<any> | null = null;
    private connected = false;
    private state: RouletteState = {
        items: [], isSpinning: false, targetRotation: 0,
        spinId: 0, spinStartedAt: 0, resultItem: '', history: []
    };
    private ui: RouletteUI;
    private animation: RouletteAnimation;

    constructor() {
        this.ui = new RouletteUI('#app', {
            onAddItem: item => this.addItem(item),
            onRemoveItem: item => this.sendEdit('remove_item', { item }),
            onSpin: () => this.spin(),
            onHistoryClick: index => this.applyHistory(index),
            onClearItems: () => this.sendEdit('clear_items', {}),
            onToggleSound: () => {
                audioManager.setEnabled(!audioManager.enabled);
                this.ui.updateSound(audioManager.enabled);
            }
        });
        this.animation = new RouletteAnimation(() => this.ui.getWheelElement());
    }

    public async start() {
        this.ui.initialize();
        audioManager.init();
        audioManager.setupAutoStart();
        this.ui.updateSound(audioManager.enabled);
        this.updateUI();
        try {
            const authData = await authenticate();
            colyseusSDK.auth.token = authData.token;
            this.room = await colyseusSDK.joinOrCreate('my_room', { channelId: discordSDK.channelId });
            this.connected = true;
            this.ui.updateConnection(true);
            this.room.onStateChange(state => this.applyState(state));
            this.room.onLeave(() => {
                this.connected = false;
                this.animation.stop();
                audioManager.stopBGM();
                this.ui.updateConnection(false, '接続が切れました。アプリを開き直してください');
                this.ui.displayResult('接続が切れました');
                this.updateUI();
            });
            this.applyState(this.room.state);
            audioManager.startBGM().catch(() => { /* Retry on user interaction. */ });
        } catch (error) {
            console.error('Failed to start game:', error);
            this.connected = false;
            this.ui.updateConnection(false, '接続できませんでした。アプリを開き直してください');
            this.updateUI();
        }
    }

    private applyState(serverState: any) {
        const roulette = serverState?.roulette;
        if (!roulette) return;
        const previous = this.state;
        this.state = {
            items: Array.from(roulette.items || []),
            isSpinning: roulette.isSpinning,
            targetRotation: roulette.targetRotation,
            spinId: roulette.spinId,
            spinStartedAt: roulette.spinStartedAt,
            resultItem: roulette.resultItem,
            history: Array.from(roulette.history || []).reverse().map((entry: any) => Array.from(entry.items || []))
        };
        this.ui.renderWheel(this.state.items);
        const newRound = this.state.spinId !== previous.spinId;
        if (this.state.isSpinning && (newRound || !previous.isSpinning)) {
            this.animation.stop();
            this.startAnimation();
        } else if (!this.state.isSpinning && !this.animation.isAnimating) {
            if (newRound && this.state.resultItem) {
                // A participant joining after a draw sees the same winning segment.
                this.animation.setRotation(this.state.targetRotation);
                this.ui.displayResult(this.state.resultItem);
            } else if (JSON.stringify(previous.items) !== JSON.stringify(this.state.items)) {
                this.ui.displayResult(this.state.items.length ? '準備完了' : '項目を追加しよう');
            }
        }
        this.updateUI();
    }

    private startAnimation() {
        this.ui.displayResult('回転中…');
        // Keep the round's result even if another player edits immediately after it ends.
        const result = this.state.resultItem;
        const elapsed = Math.max(0, Date.now() - this.state.spinStartedAt);
        this.animation.start(this.animation.currentRotation, this.state.targetRotation, {
            elapsedMs: Math.min(elapsed, 5000),
            onComplete: () => {
                this.ui.displayResult(result);
                this.updateUI();
            }
        });
    }

    private get canEdit() {
        return this.connected && !this.state.isSpinning && !this.animation.isAnimating;
    }

    private updateUI() {
        const isProcessing = this.state.isSpinning || this.animation.isAnimating;
        this.ui.renderWheel(this.state.items);
        this.ui.renderItemsList(this.state.items);
        this.ui.renderHistory(this.state.history, !this.canEdit);
        this.ui.updateEditing(!this.canEdit, this.state.items.length > 0);
        this.ui.updateSpinButton(this.connected && this.state.items.length > 0 && !isProcessing, isProcessing);
    }

    private sendEdit(type: string, payload: object) {
        if (this.canEdit) this.room?.send(type, payload);
    }

    private addItem(item: string) {
        if (!item || !this.canEdit) return;
        if (this.state.items.includes(item)) {
            this.ui.showNotification('すでに追加されている項目です');
            return;
        }
        this.sendEdit('add_item', { item });
        this.ui.clearInput();
    }

    private spin() {
        if (this.canEdit && this.state.items.length) this.room?.send('spin', {});
    }

    private applyHistory(index: number) {
        const entry = this.state.history[index];
        if (entry) this.sendEdit('apply_history', { items: entry });
    }
}
