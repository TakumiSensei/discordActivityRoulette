import { JWT } from "@colyseus/auth";
import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, type, ArraySchema } from "@colyseus/schema";
import { createHistoryStore, type PersistedHistoryEntry } from "../utils/historyStore";

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
  @type("number") targetRotation: number = 0; // 目標回転角
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
      const item = message.item?.trim();
      if (item && !this.state.roulette.items.includes(item)) {
        this.state.roulette.items.push(item);
      }
    });
    // ルーレット項目削除
    this.onMessage("remove_item", (client, message) => {
      const item = message.item;
      const idx = this.state.roulette.items.indexOf(item);
      if (idx !== -1) {
        this.state.roulette.items.splice(idx, 1);
      }
    });
    // ルーレット全項目クリア
    this.onMessage("clear_items", (client, message) => {
      this.state.roulette.items.splice(0, this.state.roulette.items.length);
    });
    // 履歴の項目を現在のルーレットに適用
    this.onMessage("apply_history", (client, message) => {
      if (this.state.roulette.isSpinning) return;
      const incomingItems: any[] = Array.isArray(message.items) ? message.items : [];
      const uniqueItems: string[] = [];

      incomingItems.forEach((raw) => {
        const trimmed = String(raw ?? "").trim();
        if (trimmed && !uniqueItems.includes(trimmed)) {
          uniqueItems.push(trimmed);
        }
      });

      this.state.roulette.items.splice(0, this.state.roulette.items.length);
      uniqueItems.forEach((item) => this.state.roulette.items.push(item));

      this.state.roulette.isSpinning = false;
      this.state.roulette.targetRotation = 0;
    });
    // ルーレット回転
    this.onMessage("spin", (client, message) => {
      if (this.state.roulette.isSpinning || this.state.roulette.items.length === 0) return;

      // 目標回転角を生成（0-360度の範囲）
      const targetRotation = Math.floor(Math.random() * 360);

      addHistorySnapshot();

      // 目標回転角を即座に設定
      this.state.roulette.targetRotation = targetRotation;
      this.state.roulette.isSpinning = true;

      console.log(`Roulette spin: target rotation: ${targetRotation}°`);

      // アニメーション時間に合わせて5秒後に停止
      setTimeout(() => {
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
