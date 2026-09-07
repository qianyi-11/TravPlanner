import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { getFirebaseApp } from "./client";

let configured = false;

function host(value: string | undefined, fallback: string) {
  const [hostname, port] = (value || fallback).split(":");
  return { hostname, port: Number(port) };
}

export function configureFirebaseEmulators() {
  if (configured || typeof window === "undefined" || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true") return;
  configured = true;
  const app = getFirebaseApp();
  const authHost = host(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  const firestoreHost = host(process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  const functionsHost = host(process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST, "127.0.0.1:5001");
  connectAuthEmulator(getAuth(app), `http://${authHost.hostname}:${authHost.port}`, { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(app), firestoreHost.hostname, firestoreHost.port);
  connectFunctionsEmulator(getFunctions(app), functionsHost.hostname, functionsHost.port);
}
