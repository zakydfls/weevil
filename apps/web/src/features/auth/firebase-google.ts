'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { readPublicEnv } from '@/lib/env';

interface FirebaseGoogleSignInResult {
  idToken: string;
  displayName: string | null;
}

export async function signInWithGoogle(): Promise<FirebaseGoogleSignInResult> {
  const app = getApps()[0] ?? initializeApp(readFirebaseConfig());
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  const credential = await signInWithPopup(auth, provider);
  const idToken = await credential.user.getIdToken(true);
  return {
    idToken,
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

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error('Google sign-in is not configured yet.');
  }

  return config;
}
