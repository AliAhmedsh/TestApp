import firestore from '@react-native-firebase/firestore';
import { COL_TEST_USERS } from '../constants';

export async function upsertTestUser(uid: string, phoneNumber: string | null) {
  await firestore()
    .collection(COL_TEST_USERS)
    .doc(uid)
    .set(
      {
        phoneNumber: phoneNumber ?? null,
        lastLoginAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}
