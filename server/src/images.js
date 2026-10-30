export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Checks the file's bytes, not its claimed type, so SVG or HTML can't be served as an upload.
export function detectImageExtension(data) {
  if (!Buffer.isBuffer(data)) return null;
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

// Reads at most the size limit, since a remote server's Content-Length can't be trusted.
export async function downloadImage(url) {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) throw new Error('Picture is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function imageUrl(filename) {
  return filename ? `/api/uploads/${filename}` : null;
}
