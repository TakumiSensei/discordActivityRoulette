# Google Cloud Run用 Dockerfile
# 1. client（フロントエンド）ビルド
FROM node:18 AS client-build
WORKDIR /app/client
COPY apps/client/package.json apps/client/package-lock.json ./
RUN npm ci
COPY apps/client/ ./
RUN npm run build

# 2. server（バックエンド）ビルド
FROM node:18 AS server-build
WORKDIR /app/server
COPY apps/server/package.json apps/server/package-lock.json ./
RUN npm ci
COPY apps/server/ ./
# clientのビルド成果物をserverのpublicにコピー
COPY --from=client-build /app/client/dist ./public
RUN npm run build

# 3. 実行用イメージ
FROM node:18-slim
WORKDIR /app/server
COPY --from=server-build /app/server .
ENV NODE_ENV=production
EXPOSE 2567
CMD ["npm", "start"] 