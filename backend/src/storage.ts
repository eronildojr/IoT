import fs from 'fs';
import path from 'path';

const SNAPSHOTS_DIR = process.env.EVENT_SNAPSHOTS_DIR || '/app/data/event-snapshots';
const BASE_URL = process.env.BASE_URL || 'https://104.237.5.59';

// Ensure directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

export async function storagePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType?: string
): Promise<{ key: string; url: string }> {
  // Save file to local disk
  const filePath = path.join(SNAPSHOTS_DIR, key.replace(/\//g, '_'));
  const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  fs.writeFileSync(filePath, buf);
  
  // Return URL accessible via /snapshots endpoint
  const filename = path.basename(filePath);
  const url = `/snapshots/${filename}`;
  
  return { key, url };
}

export async function storageGet(
  key: string,
  expiresIn?: number
): Promise<{ key: string; url: string }> {
  const filename = key.replace(/\//g, '_');
  const url = `/snapshots/${filename}`;
  return { key, url };
}
