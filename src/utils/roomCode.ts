/** Short, human-friendly room IDs (Firestore document id). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

/** Normalize user input: uppercase, strip spaces/dashes. */
export function normalizeRoomCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

export function isValidRoomCodeFormat(code: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(code);
}
