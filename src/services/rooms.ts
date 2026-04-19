import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  limit,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { COL_TEST_CHATS } from '../constants';
import { recordRoomVisit } from './roomRecents';
import {
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCodeFormat,
  normalizeRoomCode,
} from '../utils/roomCode';

export type TestChatRoom = {
  joinCode: string;
  name: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  participantIds: string[];
  /** WebRTC signaling scope — cleared when someone leaves */
  voiceCallSessionId?: string;
};

const rooms = () => collection(getFirestore(), COL_TEST_CHATS);

const MAX_CODE_ATTEMPTS = 32;

export type CreateRoomResult = {
  roomDocId: string;
  joinCode: string;
};

export async function createRoom(
  name: string,
  uid: string,
): Promise<CreateRoomResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Room name is required.');
  }
  if (trimmed.length > 40) {
    throw new Error('Room name must be 40 characters or less.');
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const joinCode = generateRoomCode();
    const taken = await getDocs(
      query(rooms(), where('joinCode', '==', joinCode), limit(1)),
    );
    if (!taken.empty) {
      continue;
    }

    const ref = doc(rooms());
    await setDoc(ref, {
      joinCode,
      name: trimmed,
      createdBy: uid,
      createdAt: serverTimestamp(),
      participantIds: [uid],
    });

    try {
      await recordRoomVisit(uid, ref.id, joinCode, trimmed);
    } catch (e) {
      console.warn('recordRoomVisit', e);
    }

    return { roomDocId: ref.id, joinCode };
  }

  throw new Error('Could not allocate a room code. Please try again.');
}

async function roomRefFromJoinCode(
  normalized: string,
): Promise<FirebaseFirestoreTypes.DocumentReference> {
  const byField = await getDocs(
    query(rooms(), where('joinCode', '==', normalized), limit(1)),
  );
  if (!byField.empty) {
    return byField.docs[0].ref;
  }

  const db = getFirestore();
  const legacyRef = doc(db, COL_TEST_CHATS, normalized);
  const legacy = await getDoc(legacyRef);
  if (legacy.exists) {
    return legacy.ref;
  }

  throw new Error('Room not found. Check the join code.');
}

export async function joinRoom(
  joinCodeRaw: string,
  uid: string,
): Promise<string> {
  const joinCode = normalizeRoomCode(joinCodeRaw);
  if (!isValidRoomCodeFormat(joinCode)) {
    throw new Error(
      `Join code must be ${ROOM_CODE_LENGTH} letters/numbers (e.g. K7P2M9).`,
    );
  }

  const ref = await roomRefFromJoinCode(joinCode);
  const snap = await getDoc(ref);
  if (!snap.exists) {
    throw new Error('Room not found.');
  }

  const data = snap.data() as Partial<TestChatRoom>;
  const ids = Array.isArray(data.participantIds)
    ? data.participantIds
    : [];

  if (ids.includes(uid)) {
    try {
      await recordRoomVisit(
        uid,
        ref.id,
        data.joinCode ?? joinCode,
        typeof data.name === 'string' ? data.name : 'Room',
      );
    } catch (e) {
      console.warn('recordRoomVisit', e);
    }
    return ref.id;
  }
  if (ids.length >= 2) {
    throw new Error('Room is full (demo allows 2 participants for voice).');
  }

  await updateDoc(ref, {
    participantIds: arrayUnion(uid),
  });

  try {
    await recordRoomVisit(
      uid,
      ref.id,
      data.joinCode ?? joinCode,
      typeof data.name === 'string' ? data.name : 'Room',
    );
  } catch (e) {
    console.warn('recordRoomVisit', e);
  }

  return ref.id;
}

/**
 * Re-enter a room by document id (e.g. from Recent). Adds uid to participantIds if not present.
 */
export async function ensureInRoom(roomDocId: string, uid: string): Promise<void> {
  const db = getFirestore();
  const ref = doc(db, COL_TEST_CHATS, roomDocId);
  const snap = await getDoc(ref);
  if (!snap.exists) {
    throw new Error('Room no longer exists.');
  }
  const data = snap.data() as Partial<TestChatRoom>;
  const ids = Array.isArray(data.participantIds) ? data.participantIds : [];
  if (ids.includes(uid)) {
    return;
  }
  if (ids.length >= 2) {
    throw new Error('Room is full (demo allows 2 participants for voice).');
  }
  await updateDoc(ref, {
    participantIds: arrayUnion(uid),
  });
}

export async function leaveRoom(roomDocId: string, uid: string): Promise<void> {
  const db = getFirestore();
  const ref = doc(db, COL_TEST_CHATS, roomDocId);
  await updateDoc(ref, {
    participantIds: arrayRemove(uid),
    voiceCallSessionId: deleteField(),
  });
}

export function getDisplayJoinCode(
  data: TestChatRoom,
  docId: string,
): string {
  if (data.joinCode && data.joinCode.length === ROOM_CODE_LENGTH) {
    return data.joinCode;
  }
  if (docId.length === ROOM_CODE_LENGTH && isValidRoomCodeFormat(docId)) {
    return docId;
  }
  return data.joinCode || docId.slice(0, 12);
}
