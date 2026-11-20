// Minimal ZIP reader (no dependencies): returns the first file inside a ZIP archive. Enough for the single-file archives GDELT publishes.
// Supports "stored" and "deflate" entries, not ZIP64, not encryption. Throws on anything else, never guesses.
import zlib from 'node:zlib';

export function readFirstZipEntry(buf, { maxOutput = 250 * 1048576 } = {}) {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a ZIP file (no end-of-archive record)');
  const total = b.readUInt16LE(eocd + 10), cdOff = b.readUInt32LE(eocd + 16);
  if (!total) throw new Error('the ZIP archive is empty');
  if (cdOff === 0xFFFFFFFF || cdOff + 46 > b.length || b.readUInt32LE(cdOff) !== 0x02014b50) throw new Error('unsupported or damaged ZIP directory');
  const flags = b.readUInt16LE(cdOff + 8), method = b.readUInt16LE(cdOff + 10), csize = b.readUInt32LE(cdOff + 20), usize = b.readUInt32LE(cdOff + 24), local = b.readUInt32LE(cdOff + 42);
  if (flags & 1) throw new Error('encrypted ZIP entries are not supported');
  if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF) throw new Error('ZIP64 archives are not supported');
  if (usize > maxOutput) throw new Error('the file inside the ZIP is larger than ' + Math.round(maxOutput / 1048576) + ' MB, ignored');
  if (local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) throw new Error('damaged ZIP entry header');
  const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
  if (start + csize > b.length) throw new Error('the ZIP archive is truncated');
  const data = b.subarray(start, start + csize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: maxOutput });
  throw new Error('unsupported ZIP compression method ' + method);
}
