import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from "firebase/auth";
import { getFirebaseApp } from "./client";
import { configureFirebaseEmulators } from "./emulator";

export function getFirebaseAuth() {
  const auth = getAuth(getFirebaseApp());
  configureFirebaseEmulators();
  return auth;
}

export async function signInWithGoogle() {
  return signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
}

export async function signOutUser() {
  return signOut(getFirebaseAuth());
}
