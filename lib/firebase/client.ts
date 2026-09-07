import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";

const publicConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;

export function getFirebaseConfigError(): string | null {
  const missing = requiredKeys.filter((key) => !publicConfig[key]);
  return missing.length > 0 ? `Missing Firebase configuration: ${missing.join(", ")}` : null;
}

export function getFirebaseApp(): FirebaseApp {
  const error = getFirebaseConfigError();
  if (error) throw new Error(error);
  return getApps().length > 0 ? getApp() : initializeApp(publicConfig);
}
