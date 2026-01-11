import { audioManager } from '../utils/Audio.js';

export interface AnimationOptions {
  duration?: number;
  onComplete?: () => void;
}

interface AnimationState {
  isAnimating: boolean;
  startTime: number | null;
  duration: number;
  startRotation: number;
  endRotation: number;
  currentRotation: number;
}

export class RouletteAnimation {
  private state: AnimationState = {
    isAnimating: false,
    startTime: null,
    duration: 5000,
    startRotation: 0,
    endRotation: 0,
    currentRotation: 0,
  };

  private animationFrameId: number | null = null;
  private onCompleteCallback: (() => void) | null = null;

  constructor(private getWheelElement: () => HTMLElement | null) { }

  public get isAnimating(): boolean {
    return this.state.isAnimating;
  }

  public get currentRotation(): number {
    return this.state.currentRotation;
  }

  public start(currentRotation: number, targetRotation: number, options?: AnimationOptions) {
    if (this.state.isAnimating) return;

    this.state.duration = options?.duration || 5000;
    this.onCompleteCallback = options?.onComplete || null;

    // Reset loop for normalized calculation
    const currentNormalized = ((currentRotation % 360) + 360) % 360;

    // Calculate shortest path + 3 full spins
    let relativeRotation = targetRotation - currentNormalized;
    if (relativeRotation < 0) {
      relativeRotation += 360;
    }
    const totalRotation = relativeRotation + 1080;

    this.state.isAnimating = true;
    this.state.startRotation = currentRotation; // Use actual current rotation to stay smooth
    this.state.endRotation = currentRotation + totalRotation;
    this.state.startTime = Date.now();

    // Start audio
    audioManager.playRoulette();

    this.animate();
  }

  public stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.state.isAnimating = false;
    audioManager.stopRoulette();
  }

  private animate = () => {
    const wheelContainer = this.getWheelElement();
    if (!wheelContainer || this.state.startTime === null) return;

    const now = Date.now();
    const elapsed = now - this.state.startTime;
    const progress = Math.min(elapsed / this.state.duration, 1);

    const ease = this.naturalEase(progress);
    this.state.currentRotation = this.state.startRotation +
      (this.state.endRotation - this.state.startRotation) * ease;

    wheelContainer.style.transform = `rotate(${this.state.currentRotation}deg)`;

    if (progress < 1) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    } else {
      this.finishAnimation();
    }
  };

  private finishAnimation() {
    this.animationFrameId = null;
    this.state.isAnimating = false;
    this.state.currentRotation = this.state.endRotation;

    // Ensure final position is set
    const wheelContainer = this.getWheelElement();
    if (wheelContainer) {
      wheelContainer.style.transform = `rotate(${this.state.currentRotation}deg)`;
    }

    audioManager.stopRoulette();
    audioManager.playSuccess();

    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }
  }

  // 自然なイージング関数（シンプルな加速→減速）
  private naturalEase(t: number): number {
    if (t < 0.5) {
      // 加速段階 (0-50%): 滑らかな加速
      const normalizedT = t / 0.5;
      return Math.pow(normalizedT, 3) * 0.5;
    } else {
      // 減速段階 (50-100%): 滑らかな減速
      const normalizedT = (t - 0.5) / 0.5;
      return 0.5 + (1 - Math.pow(1 - normalizedT, 3)) * 0.5;
    }
  }
}
