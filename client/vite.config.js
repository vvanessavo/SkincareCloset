import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // Vite otherwise picks one of localhost's addresses, which on macOS is IPv6 only,
    // so http://127.0.0.1:5173 is refused. This still listens only on this machine.
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
