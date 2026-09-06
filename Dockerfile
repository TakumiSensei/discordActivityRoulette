# ローカルと同じ npm workspaces / lockfile で依存関係を固定する。
# 個別の package.json だけで npm install すると、未検証の推移依存が選ばれる。
FROM node:20 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
RUN npm ci --include=dev --no-audit --no-fund

# 1. client（フロントエンド）ビルド
FROM dependencies AS client-build
COPY apps/client/ ./apps/client/
ARG VITE_DISCORD_CLIENT_ID=1395937511456510123
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
RUN npm run build --workspace client

# 2. server（バックエンド）ビルド
FROM dependencies AS server-build
COPY apps/server/ ./apps/server/
RUN npm run build --workspace server

# 3. 実行用イメージ
FROM node:20-slim
WORKDIR /app
# workspacesでは依存関係がルートへ配置されるため、その構造を維持する。
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=server-build /app/apps/server/package.json ./apps/server/package.json
COPY --from=server-build /app/apps/server/build ./apps/server/build
COPY --from=client-build /app/apps/client/dist ./apps/server/public
WORKDIR /app/apps/server
ENV NODE_ENV=production
EXPOSE 2567
CMD ["node", "build/index.js"]
