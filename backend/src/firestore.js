import { getDb } from "./firebaseAdmin.js";

function withMeta(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null
  };
}

export async function listUserCollection(uid, collectionName) {
  const snapshot = await getDb()
    .collection("users")
    .doc(uid)
    .collection(collectionName)
    .orderBy("updatedAt", "desc")
    .get();

  return snapshot.docs.map(withMeta);
}

export async function createUserDoc(uid, collectionName, payload) {
  const now = new Date();
  const ref = await getDb()
    .collection("users")
    .doc(uid)
    .collection(collectionName)
    .add({
      ...payload,
      createdAt: now,
      updatedAt: now
    });

  const doc = await ref.get();
  return withMeta(doc);
}

export async function updateUserDoc(uid, collectionName, id, payload) {
  const ref = getDb().collection("users").doc(uid).collection(collectionName).doc(id);
  await ref.set(
    {
      ...payload,
      updatedAt: new Date()
    },
    { merge: true }
  );

  const doc = await ref.get();
  return withMeta(doc);
}

export async function deleteUserDoc(uid, collectionName, id) {
  await getDb().collection("users").doc(uid).collection(collectionName).doc(id).delete();
}
