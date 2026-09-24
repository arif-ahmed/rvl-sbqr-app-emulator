import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The FI BFF (rvl-sbqr-fi-gateway) has no CORS policy — it is built for
// native mobile callers. In the browser we therefore talk to same-origin
// paths and let the Vite dev server forward them:
//   /bff/*  → FI Backend BFF   (default http://localhost:8080)
//   /idp/*  → FI IdP           (default http://localhost:5105, dev /mint)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const bff = env.BFF_URL || 'http://localhost:8080';
  const idp = env.IDP_URL || 'http://localhost:5105';

  const strip = (prefix: string) => (path: string) => path.replace(new RegExp(`^${prefix}`), '');

  return {
    plugins: [react()],
    define: {
      __BFF_TARGET__: JSON.stringify(bff),
      __IDP_TARGET__: JSON.stringify(idp),
    },
    server: {
      port: Number(env.PORT || 5173),
      proxy: {
        '/bff': { target: bff, changeOrigin: true, rewrite: strip('/bff') },
        '/idp': { target: idp, changeOrigin: true, rewrite: strip('/idp') },
      },
    },
    preview: {
      proxy: {
        '/bff': { target: bff, changeOrigin: true, rewrite: strip('/bff') },
        '/idp': { target: idp, changeOrigin: true, rewrite: strip('/idp') },
      },
    },
  };
});
