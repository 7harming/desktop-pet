// Set the password the installer asks for: `npm run set-installer-password`. Only a salted hash is written, to
// build/installer-password.nsh, which stays out of git; the next `npm run dist` builds it into the installer.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { passwordHash, ROUNDS } from './installer-password.mjs';

const OUT = 'build/installer-password.nsh';

/** Read a line without showing it (each character echoes as *). */
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) { reject(new Error('請在終端機裡執行，才能安全地輸入密碼')); return; }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let text = '';
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(text);
          return;
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }      // Ctrl+C
        if (ch === '\u0008' || ch === '\u007f') {                                    // Backspace
          if (text.length) { text = [...text].slice(0, -1).join(''); process.stdout.write('\b \b'); }
          continue;
        }
        text += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

const first = await askHidden('設定安裝密碼（至少 4 個字）：');
if ([...first].length < 4) { console.error('密碼太短，沒有變更。'); process.exit(1); }
const again = await askHidden('再輸入一次確認：');
if (again !== first) { console.error('兩次輸入不一樣，沒有變更。'); process.exit(1); }

const salt = randomBytes(16).toString('hex').toUpperCase();
writeFileSync(OUT, [
  '; written by `npm run set-installer-password`: the installer password, salted and hashed. Keep this file out of git.',
  `!define INSTALL_PASSWORD_SALT "${salt}"`,
  `!define INSTALL_PASSWORD_ROUNDS ${ROUNDS}`,
  `!define INSTALL_PASSWORD_HASH "${passwordHash(salt, first)}"`,
  '',
].join('\r\n'));
console.log('安裝密碼已設定。之後用 npm run dist 產生的安裝檔，安裝前都要輸入這個密碼。');
