"use client";

import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { readPublicEnv } from "@/lib/env";

interface FirebaseGoogleSignInResult {
  idToken: string;
  email: string;
  displayName: string | null;
}

export async function signInWithGoogle(): Promise<FirebaseGoogleSignInResult> {
  const app = getApps()[0] ?? initializeApp(readFirebaseConfig());
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  const idToken = await credential.user.getIdToken(true);
  const email = credential.user.email?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      "Google did not provide an email address for this account.",
    );
  }
  return {
    idToken,
    email,
    displayName: credential.user.displayName,
  };
}

function readFirebaseConfig() {
  const config = {
    apiKey: readPublicEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: readPublicEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: readPublicEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    appId: readPublicEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };

  const missing = [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", config.apiKey],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", config.authDomain],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", config.projectId],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", config.appId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Google sign-in is not configured yet. Missing: ${missing.join(", ")}`,
    );
  }

  return config;
}
