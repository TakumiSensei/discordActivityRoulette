import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      /**
       * For convenience, forward "/colyseus" requests to the local Colyseus server.
       */
      '/colyseus': {
        target: 'http://localhost:2567',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ''),
      },
      // フロントから直接 /discord_token を叩いた場合でもサーバーへ届くようにする
      '/discord_token': {
        target: 'http://localhost:2567',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/discord_token/, '/discord_token'),
      },
    },

    allowedHosts: [
      'localhost',
      '.trycloudflare.com',
      '.ngrok-free.app',
    ],
  },
})
