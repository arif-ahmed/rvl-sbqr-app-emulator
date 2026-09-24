import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Browser code calls the same-origin path /api/proxy/{idp,bff}/* in both
// dev and prod. In dev, the Vite server proxy forwards those to the local
// IdP/BFF. In prod, /api/proxy/[...path].ts (a Node serverless function)
// forwards them to IDP_URL / BFF_URL.
//
// Why a server-side proxy instead of pointing the browser directly at
// IDP_URL? The FI IdP and BFF have no CORS policy (they are built for
// native mobile callers), so we MUST hit them server-side.
//
// Why /api/proxy and not /idp + /bff edge rewrites? Edge rewrites on Vercel
// are resolved by per-POP DNS resolvers that intermittently fail for some
// external hostnames (notably *.fly.dev), returning 502. A Node serverless
// function uses Vercel's centralized outbound network and resolves DNS
// reliably from every region.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const bff = env.BFF_URL || 'http://localhost:8080';
  const idp = env.IDP_URL || 'http://localhost:5105';

  // Strip the same-origin prefix and forward to the local upstream.
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
        '/api/proxy/idp': { target: idp, changeOrigin: true, rewrite: rewrite('/api/proxy/idp') },
        '/api/proxy/bff': { target: bff, changeOrigin: true, rewrite: rewrite('/api/proxy/bff') },
      },
    },
    preview: {
      proxy: {
        '/api/proxy/idp': { target: idp, changeOrigin: true, rewrite: rewrite('/api/proxy/idp') },
        '/api/proxy/bff': { target: bff, changeOrigin: true, rewrite: rewrite('/api/proxy/bff') },
      },
    },
  };
});
