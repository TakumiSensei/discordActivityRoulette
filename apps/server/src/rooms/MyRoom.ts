import { JWT } from "@colyseus/auth";
import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, type, ArraySchema } from "@colyseus/schema";

export class Vec2 extends Schema {
  @type("number") x: number;
  @type("number") y: number;
}

export class Player extends Schema {
  @type("string") username: string;
  @type("number") heroType: number; // sprite to use (1-12)
  @type(Vec2) position = new Vec2();
}

// ルーレット用の状態
export class RouletteState extends Schema {
  @type(["string"]) items = new ArraySchema<string>();
  @type("boolean") isSpinning: boolean = false;
  @type("string") result: string = "";
  @type("number") targetRotation: number = 0; // 目標回転角を追加
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

  static onAuth(token: string) {
    return JWT.verify(token);
  }

  onCreate (options: any) {
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
      // 結果が削除された場合はリセット
      if (this.state.roulette.result === item) {
        this.state.roulette.result = "";
      }
    });
    // ルーレット回転
    this.onMessage("spin", (client, message) => {
      if (this.state.roulette.isSpinning || this.state.roulette.items.length === 0) return;
      
      // 確実にランダムな結果を決定（全ユーザーが同じ結果を見るため）
      const randomIndex = Math.floor(Math.random() * this.state.roulette.items.length);
      const selectedItem = this.state.roulette.items[randomIndex];
      
      // 目標回転角を生成（0-360度の範囲）
      const targetRotation = Math.floor(Math.random() * 360);
      
      // 結果と目標回転角を即座に設定
      this.state.roulette.result = selectedItem;
      this.state.roulette.targetRotation = targetRotation;
      this.state.roulette.isSpinning = true;
      
      console.log(`Roulette spin: selected "${selectedItem}" at index ${randomIndex}, target rotation: ${targetRotation}°`);
      
      // アニメーション時間に合わせて5秒後に停止
      setTimeout(() => {
        this.state.roulette.isSpinning = false;
        console.log(`Roulette stopped: final result "${this.state.roulette.result}" at rotation ${this.state.roulette.targetRotation}°`);
      }, 5000);
    });
  }

  onJoin (client: Client, options: any) {
    console.log(client.sessionId, "joined!");
    // プレイヤー管理は一旦コメントアウト
    // const player = new Player();
    // player.username = client.auth?.username || "Guest";
    // player.heroType = Math.floor(Math.random() * 12) + 1;
    // player.position.x = Math.floor(Math.random() * 100);
    // player.position.y = Math.floor(Math.random() * 100);
    // this.state.players.set(client.sessionId, player);
  }

  onLeave (client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    // this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

}
