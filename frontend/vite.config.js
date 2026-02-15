import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'REACT_APP_'],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
