import { getFunctions } from "firebase/functions";
import { getFirebaseApp } from "./client";
import { configureFirebaseEmulators } from "./emulator";

export function getFirebaseFunctions() {
  const functions = getFunctions(getFirebaseApp(), "us-central1");
  configureFirebaseEmulators();
  return functions;
}
