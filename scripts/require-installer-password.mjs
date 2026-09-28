// `npm run dist` runs this first: an installer is only built once its password is set.
import { existsSync } from 'node:fs';

if (!existsSync('build/installer-password.nsh')) {
  console.error('還沒有設定安裝密碼：請先執行 npm run set-installer-password');
  process.exit(1);
}
