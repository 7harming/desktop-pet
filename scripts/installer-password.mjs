import { createHash } from 'node:crypto';

/** How many times the salted password is hashed; build/password-hash.nsh repeats exactly this in the installer. */
export const ROUNDS = 2000;

/**
 * The installer password check value: SHA-256 of salt + password, then of each result again, `rounds` times in all. Each step
 * hashes the UTF-8 bytes and writes upper-case hex, which is what the installer's StdUtils::HashText does.
 */
export function passwordHash(salt, password, rounds = ROUNDS) {
  let x = salt + password;
  for (let i = 0; i < rounds; i++) x = createHash('sha256').update(x, 'utf8').digest('hex').toUpperCase();
  return x;
}
