import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Default to localhost:8000 if VITE_SERVER_URL is not set
  const serverUrl = env.VITE_SERVER_URL || 'http://127.0.0.1:8000';

  return {
    server: {
      host: true,
      port: 5173,
      fs: {
        allow: ['..'],
      },
      proxy: {
        '/ws': {
          target: serverUrl,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
