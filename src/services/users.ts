import { getFirestore, doc, setDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { COL_TEST_USERS } from '../constants';

export async function upsertTestUser(uid: string, phoneNumber: string | null) {
  const db = getFirestore();
  await setDoc(
    doc(db, COL_TEST_USERS, uid),
    {
      phoneNumber: phoneNumber ?? null,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );
}
