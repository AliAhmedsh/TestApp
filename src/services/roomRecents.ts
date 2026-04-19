import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  limit,
  query,
  serverTimestamp,
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { COL_ROOM_RECENTS, COL_TEST_USERS } from '../constants';

export type RoomRecentDoc = {
  roomDocId: string;
  joinCode: string;
  name: string;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};

function recentsCol(uid: string) {
  const db = getFirestore();
  return collection(db, COL_TEST_USERS, uid, COL_ROOM_RECENTS);
}

/** Upsert a row when user creates or joins a room (survives leaving the room). */
export async function recordRoomVisit(
  uid: string,
  roomDocId: string,
  joinCode: string,
  name: string,
): Promise<void> {
  await setDoc(
    doc(recentsCol(uid), roomDocId),
    {
      roomDocId,
      joinCode,
      name,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Live snapshot of recent rooms (ordered by last visit). */
export function subscribeRoomRecents(
  uid: string,
  onUpdate: (items: { id: string; data: RoomRecentDoc }[]) => void,
): () => void {
  return onSnapshot(
    query(recentsCol(uid), limit(50)),
    snap => {
        const items = snap.docs
          .map(d => {
            const raw = d.data();
            return {
              id: d.id,
              data: {
                roomDocId:
                  typeof raw.roomDocId === 'string' ? raw.roomDocId : d.id,
                joinCode: typeof raw.joinCode === 'string' ? raw.joinCode : '',
                name: typeof raw.name === 'string' ? raw.name : 'Room',
                updatedAt:
                  (raw.updatedAt as FirebaseFirestoreTypes.Timestamp | null) ??
                  null,
              },
            };
          })
          .sort((a, b) => {
            const ta = a.data.updatedAt?.toMillis?.() ?? 0;
            const tb = b.data.updatedAt?.toMillis?.() ?? 0;
            return tb - ta;
          });
        onUpdate(items);
      },
      err => {
        console.warn('subscribeRoomRecents failed', err);
        onUpdate([]);
      },
    );
}
