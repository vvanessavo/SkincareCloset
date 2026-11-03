import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const shim = (name) => fileURLToPath(new URL(`./src/demo/shims/${name}.js`, import.meta.url));

// The demo runs the server's routers in the browser, so their Node imports point here.
const demoAliases = {
  express: shim('express'),
  'node:fs': shim('fs'),
  'node:path': shim('path'),
  'node:crypto': shim('crypto'),
  'node:zlib': shim('unused'),
  'node:readline': shim('unused'),
};

// Only demo builds get the real transport; others would otherwise ship its SQLite file.
const transport = (mode) =>
  fileURLToPath(new URL(`./src/demo/${mode === 'demo' ? 'transport' : 'notDemo'}.js`, import.meta.url));

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the demo from /<repo name>/.
  base: mode === 'demo' ? (process.env.DEMO_BASE ?? '/SkincareCloset/') : '/',
  plugins: [react()],
  resolve: {
    alias: { 'demo-transport': transport(mode), ...(mode === 'demo' ? demoAliases : {}) },
  },
  server: {
    // Vite otherwise picks one of localhost's addresses, which on macOS is IPv6 only,
    // so http://127.0.0.1:5173 is refused. This still listens only on this machine.
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://localhost:3001',
    },
    // The demo imports the server's code from outside client/.
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'jsdom',
    alias: demoAliases,
  },
}));
