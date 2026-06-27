import admin from "firebase-admin";

function getFirebaseCredential() {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    return null;
  }

  return admin.credential.cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  });
}

const credential = getFirebaseCredential();

if (!admin.apps.length && credential) {
  admin.initializeApp({ credential });
}

export function isFirebaseReady() {
  return admin.apps.length > 0;
}

export function getAuth() {
  if (!isFirebaseReady()) {
    throw new Error("Firebase Admin is not configured. Add backend Firebase service account values to backend/.env.");
  }

  return admin.auth();
}

export function getDb() {
  if (!isFirebaseReady()) {
    throw new Error("Firebase Admin is not configured. Add backend Firebase service account values to backend/.env.");
  }

  return admin.firestore();
}
