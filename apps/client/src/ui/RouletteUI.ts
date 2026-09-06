export interface RouletteUIOptions {
  onAddItem: (item: string) => void;
  onRemoveItem: (item: string) => void;
  onSpin: () => void;
  onHistoryClick: (index: number) => void;
  onClearItems: () => void;
  onToggleSound: () => void;
}

export class RouletteUI {
  // Theme Colors
  private static readonly WHEEL_COLORS = [
    '#FCA5A5', '#FDBA74', '#FCD34D', '#86EFAC', '#93C5FD', '#C4B5FD', '#F9A8D4', '#FDA4AF'
  ];
  private itemsKey = '';
  private historyKey = '';
  private wheelKey = '';
  private editingDisabled = true;

  constructor(
    private rootSelector: string,
    private options: RouletteUIOptions
  ) { }

  public initialize() {
    const app = document.querySelector(this.rootSelector);
    if (!app) return;

    app.innerHTML = `
      <div class="app-layout">
        <!-- Game Stage (Left) -->
        <main class="game-stage">
            <header class="stage-header">
                <div><h1>みんなのルーレット</h1><p id="connectionStatus" role="status">接続中…</p></div>
                <button class="sound-btn" id="soundButton" aria-pressed="true">♪ 音 ON</button>
            </header>
            <!-- Clouds -->
            <div class="cloud c1"></div>
            <div class="cloud c2"></div>

            <!-- Hanging Sign (Result) -->
            <div class="hanging-sign-container" id="resultContainer">
                <div class="rope left"></div>
                <div class="rope right"></div>
                
                <div class="sign-board">
                    <div class="nail tl"></div>
                    <div class="nail tr"></div>
                    <div class="nail bl"></div>
                    <div class="nail br"></div>
                    
                    <span class="sign-label">結果</span>
                    <div class="sign-value" id="resultDisplay" role="status" aria-live="polite">
                        項目を追加しよう
                    </div>
                </div>
            </div>

            <!-- Wheel Area -->
            <div class="game-area">
                <div class="wheel-arrow-container">
                    ${this.getIcon('navigation', 48, 'wheel-arrow')}
                </div>
                
                <div class="wheel-frame">
                    <div class="wheel-inner" id="wheelInner" role="img" aria-label="ルーレット：項目なし"></div>
                    <div class="wheel-center">
                        <span id="wheelCount" aria-hidden="true">0</span>
                    </div>
                </div>
            </div>

            <!-- Start Button -->
            <button class="start-btn" id="spinButton" disabled>
                <div id="btnSpinnerIcon" style="display: none; margin-right: 0.5rem;">${this.getIcon('cached', 28)}</div>
                <span id="spinButtonLabel">ルーレットを回す</span>
            </button>
            <p class="stage-hint" id="stageHint">右のリストに候補を追加して、みんなで抽選！</p>

            <!-- Ground -->
            <div class="ground-section">
                <div class="grass-layer">
                    <div class="grass-pattern"></div>
                </div>
                <div class="dirt-layer"></div>
            </div>
        </main>

        <!-- UI Panel (Right) -->
        <aside class="ui-panel">
            <!-- Inventory Card -->
            <section class="glass-card items-card" aria-labelledby="itemsHeading">
                <div class="card-header">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="color: #EC4899;">${this.getIcon('playlist_add_check', 28)}</div>
                        <h2 id="itemsHeading">抽選する項目</h2>
                    </div>
                    <span class="header-badge" id="itemCountBadge">0 個</span>
                </div>

                <div class="input-group">
                    <div class="input-field-wrapper">
                        <div class="input-icon">${this.getIcon('edit', 20)}</div>
                        <input class="input-field" id="itemInput" aria-label="追加する項目" placeholder="候補を入力して Enter" type="text" disabled/>
                    </div>
                    <button class="icon-btn add" id="addButton" aria-label="項目を追加" title="項目を追加" disabled>
                        ${this.getIcon('add', 28)}
                    </button>
                </div>

                <div class="scroll-list custom-scrollbar" id="itemsList" role="list" aria-label="追加済み項目">
                    <!-- Items go here -->
                </div>

                <div class="panel-footer">
                    <span class="panel-note" id="editStatus">全員で追加・削除できます</span>
                    <button class="text-btn danger" id="clearButton" disabled>
                       ${this.getIcon('delete_sweep', 20)} <span>すべて削除</span>
                    </button>
                </div>
            </section>

                <details class="glass-card history-card" open>
                    <summary>${this.getIcon('history', 24)} <span>履歴から復元</span><span class="history-count" id="historyCount">0 件</span></summary>
                    <p class="panel-note">抽選時・全削除前・復元前のセットを保存（最新10件）</p>
                    <div class="scroll-list custom-scrollbar" id="historyList" aria-label="項目セットの履歴">
                         <!-- History items -->
                    </div>
                </details>
            </aside>
          </div>
        `;

    this.setupEventListeners();
  }

  public getWheelElement(): HTMLElement | null {
    return document.getElementById('wheelInner');
  }

  public renderWheel(items: string[]) {
    const wheelInner = document.getElementById('wheelInner');
    if (!wheelInner) return;
    const key = JSON.stringify(items);
    if (key === this.wheelKey) return;
    this.wheelKey = key;
    wheelInner.setAttribute('aria-label', `ルーレット：${items.length}項目`);
    document.getElementById('wheelCount')!.textContent = String(items.length);

    if (items.length === 0) {
      wheelInner.style.background = 'conic-gradient(#cbd5e1 0deg 360deg)';
      wheelInner.innerHTML = '';
      return;
    }

    // 1. Set Conic Gradient
    const segmentAngle = 360 / items.length;
    const gradientParts = items.map((_, i) => {
      const color = RouletteUI.WHEEL_COLORS[i % RouletteUI.WHEEL_COLORS.length];
      const start = i * segmentAngle;
      const end = (i + 1) * segmentAngle;
      return `${color} ${start}deg ${end}deg`;
    });
    // 3. Prevent Rotation Reset
    // We do NOT set wheelInner.style.transform here.
    // This ensures that the rotation set by the animation (or previous state) is preserved.
    // If we set it to '', it snaps back to 0deg.

    wheelInner.style.background = `conic-gradient(${gradientParts.join(', ')})`;

    // 2. Add Labels
    wheelInner.innerHTML = '';
    items.forEach((item, i) => {
      const label = document.createElement('div');
      label.style.position = 'absolute';
      label.style.top = '50%';
      label.style.left = '50%';
      label.style.width = '50%';
      label.style.height = '20px';
      label.style.lineHeight = '20px';
      label.style.textAlign = 'right';
      label.style.paddingRight = '24px'; // Increased padding for larger text
      label.style.paddingLeft = '42px';
      label.style.color = '#1e293b'; // Slate 800
      label.style.fontWeight = '800'; // Bolder
      label.style.fontSize = items.length > 12 ? '0.75rem' : '0.95rem';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.pointerEvents = 'none'; // Click through

      const angle = (i * segmentAngle) + (segmentAngle / 2);
      // 0deg = Top. transform-origin left center.
      // rotate(angle - 90) to match.
      const rotation = angle - 90;

      label.style.transformOrigin = 'left center';
      label.style.transform = `translateY(-50%) rotate(${rotation}deg)`;

      label.textContent = item;
      wheelInner.appendChild(label);
    });
  }

  public renderItemsList(items: string[]) {
    const itemsList = document.getElementById('itemsList');
    const badge = document.getElementById('itemCountBadge');
    if (itemsList) {
      const key = JSON.stringify(items);
      if (key === this.itemsKey) return;
      this.itemsKey = key;
      if (badge) badge.textContent = `${items.length} 個`;

      if (items.length === 0) {
        itemsList.innerHTML = '<div class="empty-state"><strong>何を当てる？</strong><span>名前やゲーム、お題などを追加しよう。<br>追加した項目はここで削除できます。</span></div>';
      } else {
        itemsList.innerHTML = items.map((item, index) => `
                <div class="list-item" role="listitem">
                    <span class="item-number" style="background:${RouletteUI.WHEEL_COLORS[index % RouletteUI.WHEEL_COLORS.length]}">${index + 1}</span>
                    <span class="item-name" title="${this.escapeHTML(item)}">${this.escapeHTML(item)}</span>
                    <button class="icon-btn danger delete-item-btn" data-index="${index}" aria-label="${this.escapeHTML(item)}を削除" title="この項目を削除">
                        ${this.getIcon('close', 20)}
                    </button>
                </div>
            `).join('');

        itemsList.querySelectorAll('.delete-item-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const index = Number((e.currentTarget as HTMLElement).dataset.index);
            if (!this.editingDisabled) this.options.onRemoveItem(items[index]);
          });
        });
      }
    }
  }

  public renderHistory(history: string[][], isSpinningOrAnimating: boolean) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    const key = JSON.stringify([history, isSpinningOrAnimating]);
    if (key === this.historyKey) return;
    this.historyKey = key;
    document.getElementById('historyCount')!.textContent = `${history.length} 件`;

    if (!history.length) {
      historyList.innerHTML = '<div class="empty-history">回すと、項目セットがここに保存されます</div>';
      return;
    }

    historyList.innerHTML = history.map((items, index) => {
      const label = index === 0 ? '最新' : `${index} 件前`;
      const itemCount = items.length;
      // REMOVED TRUNCATION HERE: Show all items joined by comma
      const preview = items.join(', ');

      return `
        <button class="history-entry" data-index="${index}" ${isSpinningOrAnimating ? 'disabled' : ''} title="${this.escapeHTML(preview)}" aria-label="${label}の${itemCount}項目を復元">
            <div class="history-icon-box">
                ${this.getIcon('save', 20)}
            </div>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 700; font-size: 0.875rem;">${label} (${itemCount}個)</div>
                <div class="history-preview">
                    ${this.escapeHTML(preview)}
                </div>
            </div>
            <span class="restore-label">復元</span>
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
    const btnSpinner = document.getElementById('btnSpinnerIcon');
    if (!spinButton) return;

    spinButton.disabled = !canSpin || isProcessing;
    document.getElementById('spinButtonLabel')!.textContent = isProcessing ? '抽選中…' : 'ルーレットを回す';
    document.getElementById('stageHint')!.textContent = isProcessing
      ? '誰に当たるかな？ 結果を待とう！'
      : '候補を追加して、みんなで抽選！';

    if (isProcessing) {
      if (btnSpinner) {
        btnSpinner.style.display = 'inline-block';
        btnSpinner.classList.add('animate-spin');
      }
      spinButton.style.cursor = 'wait';
    } else {
      if (btnSpinner) {
        btnSpinner.style.display = 'none';
        btnSpinner.classList.remove('animate-spin');
      }
      spinButton.style.cursor = canSpin ? 'pointer' : 'not-allowed';
    }
  }

  public updateEditing(disabled: boolean, hasItems: boolean) {
    this.editingDisabled = disabled;
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('#itemInput, #addButton, .delete-item-btn')
      .forEach(element => element.disabled = disabled);
    (document.getElementById('clearButton') as HTMLButtonElement).disabled = disabled || !hasItems;
    document.getElementById('editStatus')!.textContent = disabled ? '接続待ち・抽選中は編集できません' : '全員で追加・削除できます';
  }

  public updateConnection(connected: boolean, message?: string) {
    const status = document.getElementById('connectionStatus')!;
    status.textContent = message || (connected ? '● 同じルームのみんなと同期中' : '接続中…');
    status.classList.toggle('connected', connected);
  }

  public updateSound(enabled: boolean) {
    const button = document.getElementById('soundButton')!;
    button.textContent = enabled ? '♪ 音 ON' : '♪ 音 OFF';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? 'BGM・効果音をミュート' : 'BGM・効果音を再生';
  }

  private escapeHTML(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
  }

  private getIcon(name: string, size: number = 24, className: string = ''): string {
    const paths: { [key: string]: string } = {
      'navigation': 'M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z', // Arrow
      'playlist_add_check': 'M3 10H14V12H3V10ZM3 6H14V8H3V6ZM3 14H10V16H3V14ZM16.59 16.59L19 19L23 15L21.59 13.59L19 16.17L17.41 14.59L16 16L16.59 16.59Z', // List check
      'edit': 'M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z', // Pencil
      'add': 'M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z', // Plus
      'shuffle': 'M10.59 9.17L5.41 4L4 5.41L9.17 10.58L10.59 9.17ZM14.5 4L16.54 6.04L4 18.59L5.41 20L17.96 7.46L20 9.5V4H14.5ZM14.83 13.41L13.42 14.82L16.55 17.95L14.5 20H20V14.5L17.96 16.54L14.83 13.41Z', // Shuffle
      'delete_sweep': 'M15 16H19V18H15V16ZM15 8H22V10H15V8ZM15 12H21V14H15V12ZM11 18V5H4V18H11ZM9 7H6V16H9V7Z', // Trash-ish
      'history': 'M13 3C8.03 3 4 7.03 4 12H1L5 16L9 12H6C6 8.13 9.13 5 13 5C16.87 5 20 8.13 20 12C20 15.87 16.87 19 13 19C11.07 19 9.32 18.21 8.06 16.94L6.64 18.36C8.27 19.99 10.51 21 13 21C17.97 21 22 16.97 22 12C22 7.03 17.97 3 13 3ZM12 8V13L16.28 15.54L17 14.33L13.5 12.25V8H12Z', // Clock
      'save': 'M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z', // Floppy
      'chevron_right': 'M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12L10 6Z',
      'cached': 'M19 8L15 12H18C18 15.31 15.31 18 12 18C10.99 18 10.03 17.75 9.2 17.3L7.74 18.76C8.97 19.54 10.43 20 12 20C16.42 20 20 16.42 20 12H23L19 8ZM6 12C6 8.69 8.69 6 12 6C13.01 6 13.97 6.25 14.8 6.7L16.26 5.24C15.03 4.46 13.57 4 12 4C7.58 4 4 7.58 4 12H1L5 16L9 12H6Z', // Refresh
      'close': 'M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z' // X
    };

    const path = paths[name] || '';
    return `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" style="display:inline-block; vertical-align:middle; transition: inherit;">
        <path d="${path}"/>
      </svg>`;
  }

  public displayResult(text: string) {
    const resultDisplay = document.getElementById('resultDisplay');
    if (resultDisplay) {
      const display = text ? text.replace('結果: ', '') : '準備完了';
      resultDisplay.textContent = display;
      resultDisplay.title = display;
    }

    // Simple animation for the sign when result updates
    const container = document.getElementById('resultContainer');
    if (container && text) {
      container.style.transform = 'rotate(2deg)';
      setTimeout(() => {
        container.style.transform = 'rotate(-1deg)';
      }, 200);
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
    document.getElementById('soundButton')?.addEventListener('click', () => this.options.onToggleSound());
    const addButton = document.getElementById('addButton');
    if (addButton) {
      addButton.addEventListener('click', () => this.handleAddItem());
    }

    const itemInput = document.getElementById('itemInput');
    if (itemInput) {
      itemInput.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
          event.preventDefault();
          this.handleAddItem();
        }
      });
    }

    const spinButton = document.getElementById('spinButton');
    if (spinButton) {
      spinButton.addEventListener('click', () => this.options.onSpin());
    }

    const clearButton = document.getElementById('clearButton');
    if (clearButton) {
      clearButton.addEventListener('click', () => this.options.onClearItems());
    }
  }

  private handleAddItem() {
    const input = document.getElementById('itemInput') as HTMLInputElement | null;
    if (!input || this.editingDisabled) return;
    const val = input.value.trim();
    if (val) {
      this.options.onAddItem(val);
    }
  }

  public showNotification(message: string) {
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
          ${this.getIcon('close', 20)}
          <span>${this.escapeHTML(message)}</span>
      `;
    toast.setAttribute('role', 'status');

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -100%)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}
