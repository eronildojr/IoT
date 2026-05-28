import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEY_PATH = process.env.IP_CAMERAS_KEY_PATH || '/etc/groupates/ip_cameras.key';
const ALGO = 'aes-256-gcm' as const;
const IV_LEN = 12;
const TAG_LEN = 16;

function loadOrCreateKey(): Buffer {
  const envKey = process.env.IP_CAMERAS_KEY;
  if (envKey) {
    return Buffer.from(envKey, 'base64');
  }
  if (fs.existsSync(KEY_PATH)) {
    return fs.readFileSync(KEY_PATH);
  }
  const dir = path.dirname(KEY_PATH);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
  console.log(`[camera-crypto] Generated new encryption key at ${KEY_PATH}`);
  return key;
}

let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = loadOrCreateKey();
  return _key;
}

/** Returns Buffer: [iv(12)][tag(16)][ciphertext(N)] */
export function encryptPassword(plain: string): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptPassword(blob: Buffer): string {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
