import { ipcMain, safeStorage, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { CHANNELS } from './channels.js';

/* Encrypted-at-rest secret store: safeStorage wraps the OS keychain
   (DPAPI on Windows, Keychain on macOS, libsecret on Linux). The
   encrypted blob is just a file on disk — only decryptable on this
   machine, by this OS user. */

const STORE_PATH = () => path.join(app.getPath('userData'), 'secrets.enc.json');

type KeyMap = Record<string, string>;

function readEncryptedMap(): KeyMap {
  try {
    const buf = fs.readFileSync(STORE_PATH());
    if (!safeStorage.isEncryptionAvailable()) return {};
    const decrypted = safeStorage.decryptString(buf);
    return JSON.parse(decrypted) as KeyMap;
  } catch {
    return {};
  }
}

function writeEncryptedMap(map: KeyMap): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(JSON.stringify(map));
  fs.writeFileSync(STORE_PATH(), encrypted);
}

export function registerSecretsHandlers(): void {
  ipcMain.handle(CHANNELS.secretsGet, (_event, key: string) => {
    return readEncryptedMap()[key] ?? null;
  });

  ipcMain.handle(CHANNELS.secretsSet, (_event, key: string, value: string) => {
    const map = readEncryptedMap();
    map[key] = value;
    writeEncryptedMap(map);
    return true;
  });

  ipcMain.handle(CHANNELS.secretsClear, (_event, key: string) => {
    const map = readEncryptedMap();
    delete map[key];
    writeEncryptedMap(map);
    return true;
  });

  ipcMain.handle(CHANNELS.secretsHas, (_event, key: string) => {
    return key in readEncryptedMap();
  });
}
