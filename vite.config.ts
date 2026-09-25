import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Browser code calls /<target>/<path> for <target> ∈ {idp, bff}. In dev the
// Vite server proxy forwards those to the local IdP / BFF (from .env).
// In prod the same paths are answered cross-origin by the proxy project —
// see src/api/http.ts.
//
// Why a server-side proxy instead of pointing the browser directly at the
// IdP / BFF? The FI IdP and BFF have no CORS policy (they are built for
// native mobile callers), so we MUST hit them server-side.
//
// Why a separate proxy project (rather than /api/proxy/* on the SPA project)?
// Vercel's Vite framework preset suppresses api/ function bundling, and edge
// rewrites resolve via per-POP DNS that intermittently fails for *.fly.dev.
// A dedicated Node-only Vercel project (with server.ts auto-detected as a
// Node Function) avoids both issues.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const bff = env.BFF_URL || 'http://localhost:8080';
  const idp = env.IDP_URL || 'http://localhost:5105';
  const proxyOrigin = env.VITE_PROXY_ORIGIN ?? '';

  const rewrite = (prefix: string) => (path: string) =>
    path.replace(new RegExp(`^${prefix}/?`), '/');

  return {
    plugins: [react()],
    define: {
      __BFF_TARGET__: JSON.stringify(bff),
      __IDP_TARGET__: JSON.stringify(idp),
      __PROXY_ORIGIN__: JSON.stringify(proxyOrigin),
    },
    server: {
      port: Number(env.PORT || 5173),
      proxy: {
        '/idp': { target: idp, changeOrigin: true, rewrite: rewrite('/idp') },
        '/bff': { target: bff, changeOrigin: true, rewrite: rewrite('/bff') },
      },
    },
    preview: {
      proxy: {
        '/idp': { target: idp, changeOrigin: true, rewrite: rewrite('/idp') },
        '/bff': { target: bff, changeOrigin: true, rewrite: rewrite('/bff') },
      },
    },
  };
});
