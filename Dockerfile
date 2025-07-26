# Google Cloud Run用 Dockerfile
# 1. client（フロントエンド）ビルド
FROM node:20 AS client-build
WORKDIR /app/client
COPY apps/client/package.json ./
RUN npm install
COPY apps/client/ ./
ARG VITE_DISCORD_CLIENT_ID
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
RUN npm run build

# 2. server（バックエンド）ビルド
FROM node:20 AS server-build
WORKDIR /app/server
COPY apps/server/package.json ./
RUN npm install
COPY apps/server/ ./
# clientのビルド成果物をserverのpublicにコピー
COPY --from=client-build /app/client/dist ./public
RUN npm run build

# 3. 実行用イメージ
FROM node:20-slim
WORKDIR /app/server
COPY --from=server-build /app/server .
ENV NODE_ENV=production
EXPOSE 2567
CMD ["npm", "start"] 