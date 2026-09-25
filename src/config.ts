// Branding of the emulated FI app. Only affects presentation — the
// institution encoded in Tag 26 of generated QRs is decided by sbqr.api
// from the FI's tenant registration, not by the app.
//
// Deliberately fictional. This UI renders a realistic mobile-banking login
// form (user ID + password) on a throwaway vercel.app host, and Google Safe
// Browsing repeatedly flagged the app as phishing when this said "Dhaka
// Bank" — a real institution's name and tagline — even after the deploy
// domain was made FI-agnostic. Backend URLs (fi-idp-dhakabank.fly.dev,
// rvl-sbqr-fi-gateway.fly.dev) still identify the real sandbox FI; keep this
// display name generic regardless of which backend is wired up.
export const BRAND = {
  bankName: 'Demo Bank',
  appName: 'Demo Bank · Mobile (Sandbox)',
  tagline: 'Fictional bank — for testing only',
  /** Annex A code of the emulated FI (type 00 = Bank, ID 0085 = Dhaka Bank PLC). */
  institutionCode: '000085',
};

/** BRD §3: recommended maximum lifetime of a dynamic QR. */
export const DYNAMIC_QR_TTL_MS = 15 * 60 * 1000;

export const QUICK_AMOUNTS = [500, 1000, 1500, 2000, 2500, 3000, 3500, 5000];

/** Field limits from spec Table 3A / 3B / 4A. */
export const LIMITS = {
  name: 25,
  city: 15,
  postalCode: 10,
  pan: 19,
  additional: 25,
  amountChars: 13,
};

export const BFF_TARGET = __BFF_TARGET__;
export const IDP_TARGET = __IDP_TARGET__;
