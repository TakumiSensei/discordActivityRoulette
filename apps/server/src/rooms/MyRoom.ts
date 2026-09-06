import { JWT } from "@colyseus/auth";
import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, type, ArraySchema } from "@colyseus/schema";
import { createHistoryStore, type PersistedHistoryEntry } from "../utils/historyStore";
import { drawRoulette } from "../utils/rouletteDraw";

export class Vec2 extends Schema {
  @type("number") x: number;
  @type("number") y: number;
}

export class Player extends Schema {
  @type("string") username: string;
  @type("number") heroType: number; // sprite to use (1-12)
  @type(Vec2) position = new Vec2();
}

export class RouletteHistoryEntry extends Schema {
  @type(["string"]) items = new ArraySchema<string>();
  @type("number") createdAt: number = Date.now();
}

// ルーレット用の状態
export class RouletteState extends Schema {
  @type(["string"]) items = new ArraySchema<string>();
  @type("boolean") isSpinning: boolean = false;
  // 境界付近の停止角度をfloat32へ丸めず、そのまま全員に送る。
  @type("float64") targetRotation: number = 0;
  @type("number") spinId: number = 0;
  @type("number") spinStartedAt: number = 0;
  @type("string") resultItem: string = "";
  @type([RouletteHistoryEntry]) history = new ArraySchema<RouletteHistoryEntry>();
}

// export class MyRoomState extends Schema {
//   @type({ map: Player }) players = new MapSchema<Player>();
// }

export class MyRoomState extends Schema {
  @type(RouletteState) roulette = new RouletteState();
}

export class MyRoom extends Room<MyRoomState> {
  state = new MyRoomState();
  maxClients = 4;
  private static readonly HISTORY_LIMIT = 10;
  private historyStore = createHistoryStore();
  private historyKey: string | null = null;

  static onAuth(token: string) {
    return JWT.verify(token);
  }

  onCreate(options: any) {
    this.historyKey = options?.channelId ? String(options.channelId) : null;

    if (this.historyKey) {
      this.loadPersistedHistory(this.historyKey);
    }

    const addHistorySnapshot = () => {
      if (this.state.roulette.items.length === 0) {
        return;
      }
      const latest = this.state.roulette.history[this.state.roulette.history.length - 1];
      if (latest && JSON.stringify(Array.from(latest.items)) === JSON.stringify(Array.from(this.state.roulette.items))) return;
      const entry = new RouletteHistoryEntry();
      entry.createdAt = Date.now();

      // 先に履歴に追加して親/rootをセットし、その後アイテムをコピーする
      this.state.roulette.history.push(entry);
      this.state.roulette.items.forEach((item) => entry.items.push(item));

      // 古いものから削除して最大件数を維持
      while (this.state.roulette.history.length > MyRoom.HISTORY_LIMIT) {
        this.state.roulette.history.shift();
      }

      this.persistHistory();
    };

    // ルーレット項目追加
    this.onMessage("add_item", (client, message) => {
      if (this.state.roulette.isSpinning || typeof message?.item !== 'string') return;
      const item = message.item.trim();
      if (item && !this.state.roulette.items.includes(item)) {
        this.state.roulette.items.push(item);
        this.state.roulette.resultItem = '';
      }
    });
    // ルーレット項目削除
    this.onMessage("remove_item", (client, message) => {
      if (this.state.roulette.isSpinning || typeof message?.item !== 'string') return;
      const item = message.item;
      const idx = this.state.roulette.items.indexOf(item);
      if (idx !== -1) {
        this.state.roulette.items.splice(idx, 1);
        this.state.roulette.resultItem = '';
      }
    });
    // ルーレット全項目クリア
    this.onMessage("clear_items", (client, message) => {
      if (this.state.roulette.isSpinning) return;
      addHistorySnapshot();
      this.state.roulette.items.splice(0, this.state.roulette.items.length);
    });
    // 履歴の項目を現在のルーレットに適用
    this.onMessage("apply_history", (client, message) => {
      if (this.state.roulette.isSpinning || !Array.isArray(message?.items)) return;
      const incomingItems: unknown[] = message.items;
      const uniqueItems: string[] = [];

      incomingItems.forEach((raw) => {
        const trimmed = typeof raw === 'string' ? raw.trim() : '';
        if (trimmed && !uniqueItems.includes(trimmed)) {
          uniqueItems.push(trimmed);
        }
      });

      if (!uniqueItems.length) return;
      addHistorySnapshot();
      this.state.roulette.items.splice(0, this.state.roulette.items.length);
      this.state.roulette.resultItem = '';
      uniqueItems.forEach((item) => this.state.roulette.items.push(item));

      this.state.roulette.isSpinning = false;
      this.state.roulette.targetRotation = 0;
      this.state.roulette.resultItem = '';
    });
    // ルーレット回転
    this.onMessage("spin", (client, message) => {
      if (this.state.roulette.isSpinning || this.state.roulette.items.length === 0) return;

      // 当選項目と、その項目内の停止位置をサーバーで一度だけ抽選する。
      const { winnerIndex, targetRotation } = drawRoulette(this.state.roulette.items.length);

      addHistorySnapshot();

      // 目標回転角を即座に設定
      this.state.roulette.targetRotation = targetRotation;
      this.state.roulette.resultItem = this.state.roulette.items[winnerIndex];
      this.state.roulette.spinId += 1;
      this.state.roulette.spinStartedAt = Date.now();
      this.state.roulette.isSpinning = true;

      console.log(`Roulette spin: target rotation: ${targetRotation}°`);

      // アニメーション時間に合わせて5秒後に停止
      this.clock.setTimeout(() => {
        this.state.roulette.isSpinning = false;
        console.log(`Roulette stopped: target rotation ${this.state.roulette.targetRotation}°`);
      }, 5000);
    });
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");
    // プレイヤー管理は一旦コメントアウト
    // const player = new Player();
    // player.username = client.auth?.username || "Guest";
    // player.heroType = Math.floor(Math.random() * 12) + 1;
    // player.position.x = Math.floor(Math.random() * 100);
    // player.position.y = Math.floor(Math.random() * 100);
    // this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    // this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

  private async loadPersistedHistory(key: string) {
    try {
      const persisted = await this.historyStore.load(key);
      if (!Array.isArray(persisted) || persisted.length === 0) {
        return;
      }
      this.replaceHistory(persisted);
      console.log(`Loaded ${persisted.length} history entries for key ${key}`);
    } catch (err) {
      console.warn("Failed to load persisted roulette history:", err);
    }
  }

  private persistHistory() {
    if (!this.historyKey) return;
    const payload: PersistedHistoryEntry[] = this.state.roulette.history.map((entry) => ({
      createdAt: entry.createdAt || Date.now(),
      items: Array.from(entry.items || []),
    }));
    this.historyStore.save(this.historyKey, payload)
      .catch((err) => console.warn("Failed to persist roulette history:", err));
  }

  private replaceHistory(entries: PersistedHistoryEntry[]) {
    this.state.roulette.history.splice(0, this.state.roulette.history.length);
    entries.slice(-MyRoom.HISTORY_LIMIT).forEach((data) => {
      const entry = new RouletteHistoryEntry();
      entry.createdAt = data.createdAt || Date.now();
      (data.items || []).forEach((item) => entry.items.push(item));
      this.state.roulette.history.push(entry);
    });
  }

}
