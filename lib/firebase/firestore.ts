import { getFirestore } from "firebase/firestore";
import { getFirebaseApp } from "./client";
import { configureFirebaseEmulators } from "./emulator";

export function getFirebaseFirestore() {
  const firestore = getFirestore(getFirebaseApp());
  configureFirebaseEmulators();
  return firestore;
}
