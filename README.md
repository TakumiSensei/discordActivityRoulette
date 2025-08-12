## ルーレット（Discord Activity）

Discord Activity 上で動作するマルチプレイヤー対応のルーレットアプリです。参加者が自由に項目を追加・削除し、誰かが回すと同じ結果が全員に同期されます。

### 主な特徴
- **ルーム同期**: Colyseus を利用し、同一 Discord チャンネル内の参加者で同じ部屋に入ります（`channelId` でフィルタ）。
- **同一結果の抽選**: サーバー側で回転角（0–360°）を一意に決定し、全クライアントで同じ結果が表示されます。
- **シンプルなUI**: 追加した項目が円形セグメントに色分け表示され、自然な加速→減速のアニメーションで回転します。
- **Discord Embedded App SDK 連携**: Discord Activity（埋め込み）環境では OAuth フローを実施。ローカル開発ではモックを使用可能。

---

## アーキテクチャ概要

- クライアント（Vite + TypeScript）: `apps/client`
  - 初期化/画面/UIロジック: `src/main.ts`
  - Discord SDK ラッパー: `src/utils/DiscordSDK.ts`
  - 認証処理: `src/utils/Auth.ts`
  - Colyseus クライアント: `src/utils/Colyseus.ts`
- サーバ（Colyseus + Express）: `apps/server`
  - エントリ: `src/index.ts`
  - Colyseus 設定/Express: `src/app.config.ts`
  - ルーム/同期ロジック: `src/rooms/MyRoom.ts`

### 同期の仕組み（ルーレット）
- ルーム名: `my_room`（`channelId` 単位で `filterBy`）
- サーバ状態（`RouletteState`）
  - `items: string[]` 追加・削除対象の項目一覧
  - `isSpinning: boolean` 回転中フラグ
  - `targetRotation: number` 0–360 の目標回転角（サーバが決定）
- クライアント操作
  - 項目追加: `room.send("add_item", { item })`
  - 項目削除: `room.send("remove_item", { item })`
  - 回す: `room.send("spin")`
- サーバ挙動
  - `spin` 受信時、`targetRotation` をランダムに決定し `isSpinning=true`
  - 5 秒後に `isSpinning=false` に戻す（クライアントのアニメ時間と一致）
- クライアント描画
  - サーバから受け取った `targetRotation` を基準に、現在角度から 3 回転＋相対回転で合計回転角を算出
  - 自然なイージングで 5 秒回転し停止。ポインタ位置から当選インデックスを逆算

---

## 画面（イメージ）
- ルーレットのポインタは上向き固定で、項目が円周上に色分けされます。
- `video.gif` 参照（ルート直下）。

---

## 動作要件
- Node.js 20 以上
- npm

---

## セットアップ（ローカル開発）

ワークスペースで依存関係をインストールします。

```bash
npm install
```

### 環境変数
- クライアント: `apps/client/.env`
  - 例: `apps/client/example.env` を `.env` にリネーム
  - `VITE_DISCORD_CLIENT_ID=YOUR_CLIENT_ID`
    - ローカル（非埋め込み）開発ではモックを使用するため、任意値でも動作します。
- サーバ: `apps/server/.env`（必要に応じて作成）
  - `DISCORD_CLIENT_ID=YOUR_CLIENT_ID`
  - `DISCORD_CLIENT_SECRET=YOUR_CLIENT_SECRET`
  - Discord Activity（実機）で動かす場合に必須。ローカルのモック動作のみなら不要です。

### 実行（推奨: 開発モード）
ターミナルを 2 つ起動して実行します。

```bash
# ターミナル1: サーバ（ts-node）
npm run dev -w server

# ターミナル2: クライアント（Vite）
npm run dev -w client
```

- クライアント: `http://localhost:5173`
- サーバ: `http://localhost:2567`

Vite の開発サーバは `vite.config.js` の設定により、`/colyseus` へのアクセスを `http://localhost:2567` へプロキシします。

### 実行（ビルド + プロダクション）

```bash
# クライアントビルド
npm run build -w client

# サーバビルド
npm run build -w server

# サーバ起動（ビルド成果物）
npm start -w server
```

---

## Discord Activity としての起動

`apps/client/src/utils/DiscordSDK.ts` の挙動:
- 埋め込み（Discord Activity）判定: クエリ `frame_id` の有無
  - 埋め込み時: `DiscordSDK` を使用
  - 非埋め込み時: `DiscordSDKMock` を使用（ユーザー/ギルド/チャンネルはセッションストレージでモック）

`apps/client/src/utils/Auth.ts` のフロー:
1. `discordSDK.commands.authorize` で `code` を取得
2. サーバの `POST /discord_token` に `code` を送信
   - ローカルのモック時: `code === "mock_code"` を検出し、簡易トークンを返す
   - Discord Activity 実機: Discord API で `access_token` を取得 → `/users/@me` でプロフィール取得 → Colyseus JWT 発行
3. `discordSDK.commands.authenticate` を実行（Discord API を利用可能に）
4. 取得した Colyseus JWT を `colyseusSDK.auth.token` に設定

ルーム参加:
```ts
colyseusSDK.joinOrCreate("my_room", { channelId: discordSDK.channelId })
```
`channelId` で `filterBy` しているため、同じチャンネルから起動した参加者が同じ部屋に参加します。

### Discord Developer Portal（参考）
- アプリを作成し、Activity（Embedded App）として起動できるように設定します。
- 本番運用時は、以下を正しく設定してください。
  - OAuth2 クライアント ID / シークレット（サーバ `.env`）
  - URL Mappings / Redirects（`/.proxy` の扱い、`index.html` の `<base href>` 処理 参照）
  - 必要スコープ（`identify`, `guilds`, `guilds.members.read`, `rpc.voice.read` など）。
  - 参考画像: ルート直下の `settings-oauth.png`, `settings-url-mappings.png`, `production-url-mappings.png`。

---

## エンドポイントとルーム仕様

### HTTP
- `POST /discord_token`（`/colyseus/discord_token` でも可）
  - Body: `{ code: string }`
  - Response: `{ access_token, token, user }`
    - `token` は Colyseus 用 JWT

### Colyseus ルーム `my_room`
- 受信メッセージ
  - `add_item` `{ item: string }`
  - `remove_item` `{ item: string }`
  - `spin` `{}`
- ルーム状態
  - `roulette.items: string[]`
  - `roulette.isSpinning: boolean`
  - `roulette.targetRotation: number`

---

## トンネル（任意）
Discord 上でローカルアプリをテストするには、`cloudflared` 等で公開 URL を作成します。

```bash
npm run cloudflared
```

作成された URL を Discord Developer Portal の URL Mappings 等に設定します（`cloudflared-screenshot.png` 参照）。

---

## デプロイ（Cloud Run 例）

このリポジトリには Cloud Run 用の `Dockerfile` と `cloudbuild.yaml` が含まれます。

### Dockerfile（概要）
1. クライアントをビルド → 成果物をサーバの `public/` に配置
2. サーバをビルド
3. 軽量イメージで `npm start`（ポート `2567` を公開）

ビルド引数 `VITE_DISCORD_CLIENT_ID` を使用してクライアントをビルドします。

### Cloud Build
`cloudbuild.yaml` の `substitutions._VITE_DISCORD_CLIENT_ID` を適切な値に変更してください。

---

## 注意事項（セキュリティ/本番）
- サーバの `mock_code` 分岐は開発用途です。本番では削除してください。
- Discord OAuth2 クレデンシャルを安全に保管し、信頼できるオリジン/リダイレクト先のみを許可してください。
- `@colyseus/monitor` や `@colyseus/playground` は本番公開を推奨しません。

---

## ライセンス
- 本プロジェクトは `LICENSE` のとおりです。


