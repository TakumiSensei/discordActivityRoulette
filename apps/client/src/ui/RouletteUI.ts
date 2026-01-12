export interface RouletteUIOptions {
  onAddItem: (item: string) => void;
  onRemoveItem: (item: string) => void;
  onSpin: () => void;
  onHistoryClick: (index: number) => void;
}

export class RouletteUI {
  private static readonly WHEEL_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#a8e6cf', '#dcedc1'];
  private static readonly HISTORY_LIMIT = 10;

  constructor(
    private rootSelector: string,
    private options: RouletteUIOptions
  ) { }

  public initialize() {
    const app = document.querySelector(this.rootSelector);
    if (!app) return;

    app.innerHTML = `
      <div class="page">
        <div class="main-content">
          <div class="roulette-container">
            <h2 class="roulette-title">🎯 ランダムルーレット</h2>
            <div class="result-display" id="resultDisplay"></div>
            <div class="wheel-section">
              <div class="wheel-pointer"></div>
              <div class="wheel-container" id="wheelContainer">
                <div class="wheel-inner" id="wheelInner"></div>
              </div>
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
          <aside class="history-container">
            <div class="history-header">
              <h3 class="history-title">📜 履歴</h3>
              <p class="history-subtitle">最大${RouletteUI.HISTORY_LIMIT}件。クリックで復元。</p>
            </div>
            <div class="history-list" id="historyList"></div>
          </aside>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  public getWheelElement(): HTMLElement | null {
    return document.getElementById('wheelInner');
  }

  public updateWheel(items: string[], isAnimating: boolean) {
    const wheelContainer = this.getWheelElement();
    if (!wheelContainer) return;

    if (items.length === 0) {
      wheelContainer.style.background = 'conic-gradient(from 0deg, #ccc 0deg 360deg)';
      wheelContainer.innerHTML = '';
      if (!isAnimating) {
        wheelContainer.style.transform = '';
      }
      return;
    }

    const segmentAngle = 360 / items.length;

    // Gradient background
    let gradient = 'conic-gradient(from 0deg';
    items.forEach((_, index) => {
      const color = RouletteUI.WHEEL_COLORS[index % RouletteUI.WHEEL_COLORS.length];
      const startAngle = index * segmentAngle;
      const endAngle = (index + 1) * segmentAngle;
      gradient += `, ${color} ${startAngle}deg ${endAngle}deg`;
    });
    gradient += ')';
    wheelContainer.style.background = gradient;

    // Do not rebuild labels during animation to avoid layout trashing/flickering
    if (isAnimating) return;

    // Labels
    const itemLabels = items.map((item, index) => {
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

  public updateItemsList(items: string[]) {
    const itemsList = document.getElementById('itemsList');
    if (!itemsList) return;

    itemsList.innerHTML = items.map((item, index) => {
      const color = RouletteUI.WHEEL_COLORS[index % RouletteUI.WHEEL_COLORS.length];
      return `
        <span class="item-tag" style="border-color: ${color}; color: ${color};">
          ${item}
          <button class="remove-item" data-item="${item}" style="background-color: ${color}">×</button>
        </span>
      `;
    }).join('');

    itemsList.querySelectorAll('.remove-item').forEach(btn => {
      btn.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const item = target.getAttribute('data-item');
        if (item) this.options.onRemoveItem(item);
      });
    });
  }

  public updateHistoryList(history: string[][], isSpinningOrAnimating: boolean) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (!history.length) {
      historyList.innerHTML = '<div class="history-empty">まだ履歴がありません。ルーレットを回すと履歴に残ります。</div>';
      return;
    }

    historyList.innerHTML = history.map((items, index) => {
      const chips = items.map((item) => `<span class="history-chip">${item}</span>`).join('');
      const label = index === 0 ? '最新' : `${index + 1}件前`;
      return `
        <button class="history-entry" data-index="${index}" ${isSpinningOrAnimating ? 'disabled' : ''}>
          <div class="history-entry__meta">
            <span class="history-entry__label">${label}</span>
            <span class="history-entry__count">${items.length} 件</span>
          </div>
          <div class="history-entry__items">
            ${chips || '<span class="history-chip history-chip--empty">項目なし</span>'}
          </div>
        </button>
      `;
    }).join('');

    historyList.querySelectorAll('.history-entry').forEach(node => {
      node.addEventListener('click', (event) => {
        const target = event.currentTarget as HTMLElement;
        const idx = Number(target.getAttribute('data-index'));
        this.options.onHistoryClick(idx);
      });
    });
  }

  public updateSpinButton(canSpin: boolean, isProcessing: boolean) {
    const spinButton = document.getElementById('spinButton') as HTMLButtonElement | null;
    if (!spinButton) return;

    spinButton.disabled = !canSpin || isProcessing;

    if (isProcessing) {
      spinButton.textContent = '🎲 回転中...';
      spinButton.classList.add('spinning');
    } else {
      spinButton.textContent = '🎲 ルーレットを回す';
      spinButton.classList.remove('spinning');
    }
  }

  public displayResult(text: string) {
    const resultDisplay = document.getElementById('resultDisplay');
    if (resultDisplay) {
      resultDisplay.textContent = text;
    }
  }

  public clearResult() {
    this.displayResult('');
  }

  public clearInput() {
    const input = document.getElementById('itemInput') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  private setupEventListeners() {
    const addButton = document.getElementById('addButton');
    if (addButton) {
      addButton.addEventListener('click', () => this.handleAddItem());
    }

    const itemInput = document.getElementById('itemInput');
    if (itemInput) {
      itemInput.addEventListener('keypress', (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          this.handleAddItem();
        }
      });
    }

    const spinButton = document.getElementById('spinButton');
    if (spinButton) {
      spinButton.addEventListener('click', () => this.options.onSpin());
    }
  }

  private handleAddItem() {
    const input = document.getElementById('itemInput') as HTMLInputElement | null;
    if (!input) return;
    const val = input.value.trim();
    if (val) {
      this.options.onAddItem(val);
      // Input clearing is handled by the caller or UI update if successful, 
      // but for better UX we might want to clear it optimistically or wait. 
      // Current implementation clears it on success in main.ts, 
      // but here we can just clear it or let the caller tell us to clear.
      // Replicating main.ts logic: "input.value = ''" was inside addItem check.
      // We will expose a method to clear input.
    }
  }
}
