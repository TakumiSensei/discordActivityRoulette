import { discordSDK } from './utils/DiscordSDK.js';
import { colyseusSDK } from './utils/Colyseus.js';
import { authenticate } from './utils/Auth.js';
import type { MyRoomState } from "../../server/src/rooms/MyRoom.js";
import type { Room } from "colyseus.js";
import './style.css';

const WHEEL_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#a8e6cf', '#dcedc1'];

let room: Room<MyRoomState> | null = null;
let rouletteState = {
  items: [] as string[],
  isSpinning: false,
  result: ''
};

// ルーレットアニメーション用の状態
let animationFrameId: number | null = null;
let animationStartTime: number | null = null;
let animationDuration = 2000; // 全体のアニメーション時間
let startRotation = 0;
let endRotation = 0;
let spinningTargetIndex = 0;
// spinningRandomOffsetはグローバルで管理し、ルーレット1回転ごとに生成・保持
// アニメーション終了後もリセットしない
let spinningRandomOffset = 0;
let isAnimating = false;
let resultConfirmed = false;
let currentRotation = 0; // ← 追加

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
        <div class="result-display" id="resultDisplay">
          ${rouletteState.result || '結果がここに表示されます'}
        </div>
        <div class="input-section">
          <div class="input-group">
            <input type="text" id="itemInput" placeholder="項目を入力してください" />
            <button class="add-button" id="addButton">追加</button>
          </div>
          <div class="items-list" id="itemsList">
            ${rouletteState.items.map(item => `
              <span class="item-tag">
                ${item}
                <button class="remove-item" data-item="${item}">×</button>
              </span>
            `).join('')}
          </div>
          <button class="spin-button" id="spinButton" ${rouletteState.items.length === 0 ? 'disabled' : ''}>
            🎲 ルーレットを回す
          </button>
        </div>
      </div>
    </div>
  `;
  setupEventListeners();
  updateWheel();
}

// 項目追加・削除時にspinningRandomOffsetをリセット
function addItem() {
  const input = document.getElementById('itemInput') as HTMLInputElement | null;
  if (!input) return;
  const item = input.value.trim();
  if (item && !rouletteState.items.includes(item) && room) {
    spinningRandomOffset = 0; // 追加時リセット
    currentRotation = 0;      // 追加時リセット
    room.send("add_item", { item });
    input.value = '';
  }
}

function removeItem(item: string) {
  if (room) {
    spinningRandomOffset = 0; // 削除時リセット
    currentRotation = 0;      // 削除時リセット
    room.send("remove_item", { item });
  }
}

function spinRoulette() {
  if (rouletteState.items.length === 0 || rouletteState.isSpinning || !room) return;
  room.send("spin", {});
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function startRouletteAnimation() {
  if (isAnimating) return;
  const wheelContainer = document.getElementById('wheelContainer');
  if (!wheelContainer) return;
  isAnimating = true;
  resultConfirmed = false;
  // アニメーションパラメータ初期化
  const items = rouletteState.items;
  const segmentAngle = 360 / items.length;
  // 仮ターゲット（ランダム）
  spinningTargetIndex = Math.floor(Math.random() * items.length);
  // spinningRandomOffsetはここでのみ生成
  spinningRandomOffset = (Math.random() - 0.5) * (segmentAngle * 2 / 3);
  startRotation = ((currentRotation % 360) + 360) % 360;
  // 3〜5回転して仮ターゲットに向かう
  endRotation = startRotation + (3 + Math.random() * 2) * 360 + (360 - (spinningTargetIndex * segmentAngle + segmentAngle / 2 + spinningRandomOffset));
  animationDuration = 1500 + Math.random() * 700; // 1.5〜2.2秒
  animationStartTime = Date.now();
  animateRoulette();
}

function animateRoulette() {
  const wheelContainer = document.getElementById('wheelContainer');
  const resultDisplay = document.getElementById('resultDisplay');
  if (!wheelContainer || !resultDisplay || animationStartTime === null) return;
  const now = Date.now();
  const elapsed = now - animationStartTime;
  const progress = Math.min(elapsed / animationDuration, 1);
  const ease = easeInOutCubic(progress);
  currentRotation = startRotation + (endRotation - startRotation) * ease;
  wheelContainer.style.transform = `rotate(${currentRotation}deg)`;
  // アニメーション中のみ結果欄を更新
  if (progress < 1) {
    const pointedItem = getCurrentPointedItemFromRotation(currentRotation, spinningRandomOffset);
    resultDisplay.textContent = pointedItem;
    animationFrameId = requestAnimationFrame(animateRoulette);
  } else {
    animationFrameId = null;
    isAnimating = false;
    // spinningRandomOffsetはリセットしない
    // 停止位置の項目をそのまま表示（以降はupdateUIで上書きしない）
    const pointedItem = getCurrentPointedItemFromRotation(currentRotation, spinningRandomOffset);
    resultDisplay.textContent = pointedItem;
    // フラグで「結果欄は確定済み」とする
    resultDisplay.setAttribute('data-locked', 'true');
  }
}

// サーバーからresultが確定したら、ターゲットに向かって減速して止める
function confirmRouletteResult() {
  if (!isAnimating) return;
  if (resultConfirmed) return;
  resultConfirmed = true;
  const items = rouletteState.items;
  const segmentAngle = 360 / items.length;
  const resultIndex = items.indexOf(rouletteState.result);
  if (resultIndex === -1) return;
  // spinningRandomOffsetは再生成しない
  const wheelContainer = document.getElementById('wheelContainer');
  if (!wheelContainer) return;
  const current = currentRotation;
  startRotation = current;
  const targetRotation = 360 - (resultIndex * segmentAngle + segmentAngle / 2 + spinningRandomOffset);
  let normalizedCurrent = ((current % 360) + 360) % 360;
  let diff = targetRotation - normalizedCurrent;
  if (diff < 0) diff += 360;
  endRotation = current + diff + 2 * 360; // 2回転以上してターゲット
  animationDuration = 1000 + Math.random() * 500; // 1.0〜1.5秒
  animationStartTime = Date.now();
  animateRoulette();
}

function getCurrentPointedItemFromRotation(rotation: number, offset: number = spinningRandomOffset): string {
  if (rouletteState.items.length === 0) return '';
  const segmentAngle = 360 / rouletteState.items.length;
  // 0度が項目の中心になるように調整
  let normalizedRotation = ((rotation % 360) + 360) % 360;
  let index = Math.round((360 - normalizedRotation - segmentAngle / 2 - offset) / segmentAngle) % rouletteState.items.length;
  if (index < 0) index += rouletteState.items.length;
  return rouletteState.items[index] || '';
}

function updateWheel() {
  const wheelContainer = document.getElementById('wheelContainer');
  if (!wheelContainer) return;
  if (rouletteState.items.length === 0) {
    wheelContainer.style.background = 'conic-gradient(from 0deg, #ccc 0deg 360deg)';
    wheelContainer.innerHTML = '';
    if (!isAnimating) {
      wheelContainer.style.transform = '';
      currentRotation = 0;
      spinningRandomOffset = 0;
    }
    return;
  }
  const segmentAngle = 360 / rouletteState.items.length;
  let gradient = 'conic-gradient(from 0deg';
  rouletteState.items.forEach((item, index) => {
    const color = WHEEL_COLORS[index % WHEEL_COLORS.length];
    const startAngle = index * segmentAngle;
    const endAngle = (index + 1) * segmentAngle;
    gradient += `, ${color} ${startAngle}deg ${endAngle}deg`;
  });
  gradient += ')';
  wheelContainer.style.background = gradient;
  const itemLabels = rouletteState.items.map((item, index) => {
    // 中心が0度に来るように調整
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
  // アニメーション中・停止後はtransform/currentRotationを絶対に上書きしない
  // 項目追加・削除時や新ルーレット開始時のみリセット
}

// updateUIで結果欄を上書きしないように修正
function updateUI() {
  updateWheel();
  // itemsList再描画＋削除ボタン
  const itemsList = document.getElementById('itemsList') as HTMLElement | null;
  if (itemsList) {
    itemsList.innerHTML = rouletteState.items.map((item, index) => {
      const color = WHEEL_COLORS[index % WHEEL_COLORS.length];
      return `
        <span class="item-tag" style="border-left: 4px solid ${color}">
          ${item}
          <button class="remove-item" data-item="${item}" style="background-color: ${color}">×</button>
        </span>
      `;
    }).join('');
    // 削除ボタンのイベントリスナー再設定
    itemsList.querySelectorAll('.remove-item').forEach(btn => {
      btn.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const item = target.getAttribute('data-item');
        if (item) removeItem(item);
      });
    });
  }
  // spinButtonの有効化制御
  const spinButton = document.getElementById('spinButton') as HTMLButtonElement | null;
  if (spinButton) {
    spinButton.disabled = rouletteState.items.length === 0 || rouletteState.isSpinning;
    spinButton.textContent = rouletteState.isSpinning ? '🎲 回転中...' : '🎲 ルーレットを回す';
    if (rouletteState.isSpinning) {
      spinButton.classList.add('spinning');
    } else {
      spinButton.classList.remove('spinning');
    }
  }
  // 結果欄のロック判定
  const resultDisplay = document.getElementById('resultDisplay');
  const isLocked = resultDisplay?.getAttribute('data-locked') === 'true';
  if (!isLocked && resultDisplay && !isAnimating) {
    resultDisplay.textContent = rouletteState.result || '結果がここに表示されます';
  }
  if (rouletteState.isSpinning) {
    if (!isAnimating && rouletteState.items.length > 0) {
      if (resultDisplay) resultDisplay.removeAttribute('data-locked');
      startRouletteAnimation();
    }
    if (isAnimating && rouletteState.result && !resultConfirmed) {
      confirmRouletteResult();
    }
  }
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
  const itemsList = document.getElementById('itemsList') as HTMLElement | null;
  if (itemsList) {
    itemsList.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.classList.contains('remove-item')) {
        const item = target.getAttribute('data-item');
        if (item) {
          removeItem(item);
        }
      }
    });
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
  // Room State購読（state全体のonChangeで検知）
  if (room) {
    room.onStateChange((state: MyRoomState) => {
      rouletteState.items = Array.from(state.roulette.items);
      rouletteState.isSpinning = state.roulette.isSpinning;
      rouletteState.result = state.roulette.result;
      updateUI();
    });
    // 初期UI
    document.body.innerHTML = '<div id="app"></div>';
    initializeRoulette();
    // 初期状態反映
    rouletteState.items = Array.from(room.state.roulette.items);
    rouletteState.isSpinning = room.state.roulette.isSpinning;
    rouletteState.result = room.state.roulette.result;
    updateUI();
  }
}

document.addEventListener('DOMContentLoaded', main);