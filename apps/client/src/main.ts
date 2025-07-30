import { discordSDK } from './utils/DiscordSDK.js';
import { colyseusSDK } from './utils/Colyseus.js';
import { authenticate } from './utils/Auth.js';
import type { Room } from "colyseus.js";
import './style.css';

const WHEEL_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#a8e6cf', '#dcedc1'];

// ルーレット状態
interface RouletteState {
  items: string[];
  isSpinning: boolean;
  targetRotation: number; // サーバーから送られた目標回転角
}

// アニメーション状態
interface AnimationState {
  isAnimating: boolean;
  startTime: number | null;
  duration: number;
  startRotation: number;
  endRotation: number;
  currentRotation: number;
  targetIndex: number;
}

let room: Room<any> | null = null;
let rouletteState: RouletteState = {
  items: [],
  isSpinning: false,
  targetRotation: 0
};

let animationState: AnimationState = {
  isAnimating: false,
  startTime: null,
  duration: 3000,
  startRotation: 0,
  endRotation: 0,
  currentRotation: 0,
  targetIndex: 0
};

let animationFrameId: number | null = null;

// 自然なイージング関数（シンプルな加速→減速）
function naturalEase(t: number): number {
  // 滑らかな加速→減速の2段階
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

function initializeRoulette() {
  const app = document.querySelector('#app');
  if (!app) return;
  
  app.innerHTML = `
    <div class="main-content">
      <div class="roulette-container">
        <h2 class="roulette-title">🎯 ランダムルーレット</h2>
        <div class="wheel-section">
          <div class="wheel-pointer"></div>
          <div class="wheel-container" id="wheelContainer"></div>
        </div>
        <div class="input-section">
          <div class="input-group">
            <input type="text" id="itemInput" placeholder="項目を入力してください" />
            <button class="add-button" id="addButton">追加</button>
          </div>
          <div class="items-list" id="itemsList"></div>
          <button class="spin-button" id="spinButton" disabled>
            🎲 ルーレットを回す
          </button>
        </div>
      </div>
    </div>
  `;
  
  setupEventListeners();
  updateWheel();
}

function addItem() {
  const input = document.getElementById('itemInput') as HTMLInputElement | null;
  if (!input) return;
  
  const item = input.value.trim();
  if (item && !rouletteState.items.includes(item) && room) {
    room.send("add_item", { item });
    input.value = '';
  }
}

function removeItem(item: string) {
  if (room) {
    room.send("remove_item", { item });
  }
}

function spinRoulette() {
  if (rouletteState.items.length === 0 || rouletteState.isSpinning || !room || animationState.isAnimating) return;
  
  room.send("spin", {});
}

function startAnimation() {
  if (animationState.isAnimating) {
    return;
  }
  
  const wheelContainer = document.getElementById('wheelContainer');
  if (!wheelContainer) {
    return;
  }
  
  const items = rouletteState.items;
  if (items.length === 0) {
    return;
  }
  
  // targetRotationから結果の項目を計算
  // ルーレットのポインターは上向き（0度）に固定されている
  // 各セグメントは0度から始まって時計回りに配置されている
  const segmentAngle = 360 / items.length;
  const normalizedTargetRotation = ((rouletteState.targetRotation % 360) + 360) % 360;
  
  // ポインターが指す角度を計算（ポインターは上向きなので、回転角の反対方向が指す角度）
  const pointerAngle = (360 - normalizedTargetRotation) % 360;
  
  // ポインターが指す角度から結果のインデックスを計算
  const resultIndex = Math.floor(pointerAngle / segmentAngle);
  const resultItem = items[resultIndex % items.length];
  
  console.log('Animation calculation:', {
    resultItem,
    targetRotation: rouletteState.targetRotation,
    normalizedTargetRotation,
    pointerAngle,
    resultIndex,
    currentRotation: animationState.currentRotation,
    startRotation: animationState.startRotation
  });
  
  // アニメーション状態を初期化
  animationState.isAnimating = true;
  animationState.startRotation = animationState.currentRotation;
  
  // サーバーから送られた目標回転角を使用して、現在位置からの相対的な回転角を計算
  // 例: サーバー側が55度、現在位置が60度の場合、360-60+55=355度回転
  const currentNormalized = ((animationState.currentRotation % 360) + 360) % 360;
  const targetNormalized = rouletteState.targetRotation;
  
  // 現在位置から目標位置までの最短距離を計算
  let relativeRotation = targetNormalized - currentNormalized;
  if (relativeRotation < 0) {
    relativeRotation += 360;
  }
  
  // 3回転分を追加（1080度）
  const totalRotation = relativeRotation + 1080;
  
  animationState.endRotation = animationState.startRotation + totalRotation;
  
  console.log('Rotation calculation:', {
    currentNormalized,
    targetNormalized,
    relativeRotation,
    totalRotation,
    startRotation: animationState.startRotation,
    endRotation: animationState.endRotation
  });
  
  // アニメーション時間を設定
  animationState.duration = 5000; // 5秒
  animationState.startTime = Date.now();
  
  // 即座にアニメーション開始
  animate();
}

function animate() {
  const wheelContainer = document.getElementById('wheelContainer');
  if (!wheelContainer || animationState.startTime === null) return;
  
  const now = Date.now();
  const elapsed = now - animationState.startTime;
  const progress = Math.min(elapsed / animationState.duration, 1);
  
  // 自然なイージングを適用
  const ease = naturalEase(progress);
  
  animationState.currentRotation = animationState.startRotation + 
    (animationState.endRotation - animationState.startRotation) * ease;
  
  wheelContainer.style.transform = `rotate(${animationState.currentRotation}deg)`;
  
  if (progress < 1) {
    animationFrameId = requestAnimationFrame(animate);
  } else {
    // アニメーション完了
    animationFrameId = null;
    animationState.isAnimating = false;
    animationState.currentRotation = animationState.endRotation;
    wheelContainer.style.transform = `rotate(${animationState.currentRotation}deg)`;
    
    // UIを更新してボタン状態を反映
    updateUI();
  }
}

function updateWheel() {
  const wheelContainer = document.getElementById('wheelContainer');
  if (!wheelContainer) return;
  
  if (rouletteState.items.length === 0) {
    wheelContainer.style.background = 'conic-gradient(from 0deg, #ccc 0deg 360deg)';
    wheelContainer.innerHTML = '';
    if (!animationState.isAnimating) {
      wheelContainer.style.transform = '';
      animationState.currentRotation = 0;
    }
    return;
  }
  
  const segmentAngle = 360 / rouletteState.items.length;
  
  // グラデーション背景を作成
  let gradient = 'conic-gradient(from 0deg';
  rouletteState.items.forEach((item, index) => {
    const color = WHEEL_COLORS[index % WHEEL_COLORS.length];
    const startAngle = index * segmentAngle;
    const endAngle = (index + 1) * segmentAngle;
    gradient += `, ${color} ${startAngle}deg ${endAngle}deg`;
  });
  gradient += ')';
  wheelContainer.style.background = gradient;
  
  // アニメーション中はラベルを再設定しない
  if (animationState.isAnimating) {
    return;
  }
  
  // ラベルを作成
  const itemLabels = rouletteState.items.map((item, index) => {
    const angle = index * segmentAngle + segmentAngle / 2;
    const radius = 110;
    const x = Math.cos((angle - 90) * Math.PI / 180) * radius;
    const y = Math.sin((angle - 90) * Math.PI / 180) * radius;
    
    return `
      <div class="wheel-label" style="
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(${x}px, ${y}px) rotate(${angle}deg);
        color: white;
        font-weight: bold;
        font-size: 16px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.9);
        white-space: nowrap;
        pointer-events: none;
        z-index: 5;
        text-align: center;
        width: 80px;
        margin-left: -40px;
      ">
        ${item}
      </div>
    `;
  }).join('');
  
  wheelContainer.innerHTML = itemLabels;
}

function updateItemsList() {
  const itemsList = document.getElementById('itemsList') as HTMLElement | null;
  if (!itemsList) return;
  
  itemsList.innerHTML = rouletteState.items.map((item, index) => {
    const color = WHEEL_COLORS[index % WHEEL_COLORS.length];
    return `
      <span class="item-tag" style="border-left: 4px solid ${color}">
        ${item}
        <button class="remove-item" data-item="${item}" style="background-color: ${color}">×</button>
      </span>
    `;
  }).join('');
  
  // 削除ボタンのイベントリスナーを設定
  itemsList.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const item = target.getAttribute('data-item');
      if (item) removeItem(item);
    });
  });
}

function updateSpinButton() {
  const spinButton = document.getElementById('spinButton') as HTMLButtonElement | null;
  if (!spinButton) return;
  
  // ボタンの有効/無効を決定
  const canSpin = rouletteState.items.length > 0 && !rouletteState.isSpinning && !animationState.isAnimating;
  spinButton.disabled = !canSpin;
  
  // ボタンのテキストを更新
  if (rouletteState.isSpinning || animationState.isAnimating) {
    spinButton.textContent = '🎲 回転中...';
    spinButton.classList.add('spinning');
  } else {
    spinButton.textContent = '🎲 ルーレットを回す';
    spinButton.classList.remove('spinning');
  }
}

function updateUI() {
  // アニメーション中はwheelの更新をスキップ
  if (!animationState.isAnimating) {
    updateWheel();
  }
  updateItemsList();
  updateSpinButton();
}

function setupEventListeners() {
  const addButton = document.getElementById('addButton') as HTMLButtonElement | null;
  if (addButton) {
    addButton.addEventListener('click', addItem);
  }
  
  const itemInput = document.getElementById('itemInput') as HTMLInputElement | null;
  if (itemInput) {
    itemInput.addEventListener('keypress', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        addItem();
      }
    });
  }
  
  const spinButton = document.getElementById('spinButton') as HTMLButtonElement | null;
  if (spinButton) {
    spinButton.addEventListener('click', spinRoulette);
  }
}

async function main() {
  // Colyseus認証
  const authData = await authenticate();
  colyseusSDK.auth.token = authData.token;
  
  // Room参加
  room = await colyseusSDK.joinOrCreate("my_room", {
    channelId: discordSDK.channelId
  });
  
  if (room) {
    // Room State購読
    room.onStateChange((state: any) => {
      const previousSpinning = rouletteState.isSpinning;
      const previousTargetRotation = rouletteState.targetRotation;
      
      rouletteState.items = Array.from(state.roulette.items || []);
      rouletteState.isSpinning = state.roulette.isSpinning;
      rouletteState.targetRotation = state.roulette.targetRotation; // サーバーから目標回転角を取得
      
      // UIを更新
      updateUI();
      
      // アニメーション開始チェック
      if (rouletteState.isSpinning && !previousSpinning) {
        // スピン開始時
        if (rouletteState.targetRotation !== 0) {
          // 目標回転角が設定されている場合は即座にアニメーション開始
          startAnimation();
        }
      } else if (!rouletteState.isSpinning && previousSpinning) {
        // スピン停止時
        animationState.isAnimating = false;
        updateUI(); // UIを更新してボタン状態を反映
      } else if (rouletteState.targetRotation !== previousTargetRotation && rouletteState.isSpinning) {
        // 目標回転角が変更された時
        startAnimation();
      }
    });
    
    // 初期UI
    document.body.innerHTML = '<div id="app"></div>';
    initializeRoulette();
    
    // 初期状態反映（安全に）
    try {
      rouletteState.items = Array.from(room.state.roulette.items || []);
      rouletteState.isSpinning = room.state.roulette.isSpinning;
      rouletteState.targetRotation = room.state.roulette.targetRotation; // サーバーから目標回転角を取得
    } catch (error) {
      console.log('Initial state not available yet:', error);
      rouletteState.items = [];
      rouletteState.isSpinning = false;
      rouletteState.targetRotation = 0; // 初期状態では0に設定
    }
    updateUI();
  }
}

document.addEventListener('DOMContentLoaded', main);