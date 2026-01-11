import { Room } from "colyseus.js";
import { colyseusSDK } from '../utils/Colyseus.js';
import { discordSDK } from '../utils/DiscordSDK.js';
import { authenticate } from '../utils/Auth.js';
import { audioManager } from '../utils/Audio.js';
import { RouletteUI } from '../ui/RouletteUI.js';
import { RouletteAnimation } from './RouletteAnimation.js';

export interface RouletteState {
    items: string[];
    isSpinning: boolean;
    targetRotation: number;
    history: string[][];
}

export class RouletteGame {
    private room: Room<any> | null = null;
    private state: RouletteState = {
        items: [],
        isSpinning: false,
        targetRotation: 0,
        history: []
    };

    private ui: RouletteUI;
    private animation: RouletteAnimation;

    constructor() {
        this.ui = new RouletteUI('#app', {
            onAddItem: (item: string) => this.addItem(item),
            onRemoveItem: (item: string) => this.removeItem(item),
            onSpin: () => this.spin(),
            onHistoryClick: (index: number) => this.applyHistory(index)
        });

        this.animation = new RouletteAnimation(() => this.ui.getWheelElement());
    }

    public async start() {
        this.ui.initialize();

        // Audio init (user gesture might be needed, but we init on start)
        audioManager.init();

        try {
            const authData = await authenticate();
            colyseusSDK.auth.token = authData.token;

            this.room = await colyseusSDK.joinOrCreate("my_room", {
                channelId: discordSDK.channelId
            });

            if (this.room) {
                this.setupRoomListeners();
                this.updateStateFromRoom(); // Initial state
                this.updateUI(); // Initial draw

                // Start BGM
                try {
                    await audioManager.startBGM();
                } catch (err) {
                    console.warn('BGM Auto-play failed:', err);
                }
            }
        } catch (error) {
            console.error("Failed to start game:", error);
        }
    }

    private setupRoomListeners() {
        if (!this.room) return;

        this.room.onStateChange((serverState: any) => {
            const previousSpinning = this.state.isSpinning;
            const previousTargetRotation = this.state.targetRotation;

            // Update local state
            this.state.items = Array.from(serverState.roulette.items || []);
            this.state.isSpinning = serverState.roulette.isSpinning;
            this.state.targetRotation = serverState.roulette.targetRotation;

            const historyEntries = Array.from(serverState.roulette.history || []);
            historyEntries.reverse();
            this.state.history = historyEntries.map((entry: any) => Array.from(entry.items || []));

            // Handle Animation Triggers
            if (this.state.isSpinning && !previousSpinning) {
                // Start spin
                if (this.state.targetRotation !== 0) {
                    this.startAnimation();
                }
            } else if (!this.state.isSpinning && previousSpinning) {
                // Stop spin (usually triggered by timer on server, or manual stop?)
                // In this architecture, animation logic controls the visual stop, 
                // but if server says stop, we should ensure we are consistent.
                // If animation is still running, let it finish naturally or force stop?
                // Original logic: "if (!rouletteState.isSpinning && previousSpinning) { animationState.isAnimating = false; ... }"
                // We should respect the server state.

                if (this.animation.isAnimating) {
                    // If we are still animating but server says stop, it implies we might be out of sync or server timed out.
                    // However, usually detailed animation timing is client side.
                    // We will trust the animation to finish calling 'onComplete'.
                    // But if the server flipped isSpinning to false, it means the round is over.
                    // We'll let the animation finish its visual effect if it's close, or just rely on the mapped state.
                }

                // Ensure UI is updated
                this.updateUI();
            } else if (this.state.targetRotation !== previousTargetRotation && this.state.isSpinning) {
                // Target changed while spinning (initial start lag?)
                this.startAnimation();
            }

            // Always update UI to reflect items/history
            this.updateUI();
        });
    }

    private updateStateFromRoom() {
        if (!this.room) return;
        try {
            this.state.items = Array.from(this.room.state.roulette.items || []);
            this.state.isSpinning = this.room.state.roulette.isSpinning;
            this.state.targetRotation = this.room.state.roulette.targetRotation;
            const historyEntries = Array.from(this.room.state.roulette.history || []);
            historyEntries.reverse();
            this.state.history = historyEntries.map((entry: any) => Array.from(entry.items || []));
        } catch (e) {
            console.warn('Initial state parse error:', e);
        }
    }

    private startAnimation() {
        this.ui.clearResult();

        // Calculate start rotation (current visual rotation)
        const currentRotation = this.animation.currentRotation;

        this.animation.start(currentRotation, this.state.targetRotation, {
            onComplete: () => {
                // Animation finished
                this.showResult();
                this.updateUI();
            }
        });
    }

    private showResult() {
        const items = this.state.items;
        if (items.length > 0) {
            const segmentAngle = 360 / items.length;
            const normalizedTarget = ((this.state.targetRotation % 360) + 360) % 360;
            // Pointer is at 0 (top), so we check what item is at 0.
            // If we rotated `normalizedTarget` clockwise, the item at 0 is the one that was at `360 - normalizedTarget`.
            const pointerAngle = (360 - normalizedTarget) % 360;
            const resultIndex = Math.floor(pointerAngle / segmentAngle) % items.length;
            const resultItem = items[resultIndex];

            this.ui.displayResult(`結果: ${resultItem}`);
        }
    }

    private updateUI() {
        const isProcessing = this.state.isSpinning || this.animation.isAnimating;

        this.ui.updateWheel(this.state.items, this.animation.isAnimating);
        this.ui.updateItemsList(this.state.items);
        this.ui.updateHistoryList(this.state.history, isProcessing);

        const canSpin = this.state.items.length > 0 && !isProcessing;
        this.ui.updateSpinButton(canSpin, isProcessing);
    }

    // --- Actions ---

    private addItem(item: string) {
        if (item && !this.state.items.includes(item) && this.room) {
            this.room.send("add_item", { item });
            this.ui.clearInput();
        }
    }

    private removeItem(item: string) {
        if (this.room) {
            this.room.send("remove_item", { item });
        }
    }

    private spin() {
        if (this.state.items.length === 0 || this.state.isSpinning || !this.room || this.animation.isAnimating) return;
        this.room.send("spin", {});
    }

    private applyHistory(index: number) {
        if (!this.room) return;
        if (this.state.isSpinning || this.animation.isAnimating) return;
        const entry = this.state.history[index];
        if (entry) {
            this.room.send("apply_history", { items: entry });
        }
    }
}
