import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: { alias: { react: 'preact/compat', 'react-dom': 'preact/compat' } },
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || '1.0.0-dev') },
  build: { outDir: 'dist', target: 'chrome87', assetsInlineLimit: 0, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
