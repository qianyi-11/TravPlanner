import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getFirebaseApp } from "./client";

let appCheck: AppCheck | undefined;

export function initializeFirebaseAppCheck() {
  if (typeof window === "undefined" || appCheck) return appCheck;
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") return undefined;
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  if (!siteKey) return undefined;
  appCheck = initializeAppCheck(getFirebaseApp(), {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheck;
}
