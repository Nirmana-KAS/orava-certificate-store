// Personal upload passkeys: made by the server, shown to the admin once, typed by the uploader.

/** Letters and digits that can't be mixed up when read aloud or copied (no 0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const UPLOAD_PASSKEY_GROUPS = 4;
export const UPLOAD_PASSKEY_GROUP_LENGTH = 4;
/** Wrong tries in a row before upload mode is locked until the admin issues a new passkey */
export const UPLOAD_PASSKEY_MAX_FAILURES = 5;

/** "K7QM-3XPA-W9RT-HC2D": 16 characters from 31, about 79 bits. */
export function formatUploadPasskey(randomIndex: (max: number) => number): string {
  const groups: string[] = [];
  for (let g = 0; g < UPLOAD_PASSKEY_GROUPS; g++) {
    let group = "";
    for (let i = 0; i < UPLOAD_PASSKEY_GROUP_LENGTH; i++)
      group += ALPHABET[randomIndex(ALPHABET.length)];
    groups.push(group);
  }
  return groups.join("-");
}

/** What the uploader typed, the way it was stored: capitals, no spaces or dashes. */
export function normalizeUploadPasskey(typed: string): string {
  return typed.toUpperCase().replace(/[\s-]+/g, "");
}
