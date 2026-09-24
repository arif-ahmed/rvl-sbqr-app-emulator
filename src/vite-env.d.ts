/// <reference types="vite/client" />

declare const __BFF_TARGET__: string;
declare const __IDP_TARGET__: string;

interface ImportMetaEnv {
  readonly VITE_IDP_ISSUER?: string;
  readonly VITE_IDP_AUDIENCE?: string;
}
