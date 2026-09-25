import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Browser code calls the same-origin paths /idp/* and /bff/*. In dev the Vite
// server proxy forwards them to the local IdP / BFF (from .env); in prod the
// rewrites in vercel.json forward them to the FI's hosted IdP / BFF.
//
// Why a server-side proxy instead of pointing the browser directly at the
// IdP / BFF? The FI IdP and BFF have no CORS policy (they are built for
// native mobile callers), so we MUST hit them server-side.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const bff = env.BFF_URL || 'http://localhost:8080';
  const idp = env.IDP_URL || 'http://localhost:5105';

  const rewrite = (prefix: string) => (path: string) =>
    path.replace(new RegExp(`^${prefix}/?`), '/');

  return {
    plugins: [react()],
    define: {
      __BFF_TARGET__: JSON.stringify(bff),
      __IDP_TARGET__: JSON.stringify(idp),
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
