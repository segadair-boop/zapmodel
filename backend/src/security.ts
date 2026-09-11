import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, RequestHandler } from 'express';
import type { FileFilterCallback } from 'multer';

const MAX_FILENAME = 180;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const allowedExtensions: Record<string, Set<string>> = {
  'image/jpeg': new Set(['.jpg', '.jpeg']),
  'image/png': new Set(['.png']),
  'image/webp': new Set(['.webp']),
  'video/mp4': new Set(['.mp4']),
  'audio/ogg': new Set(['.ogg', '.opus']),
  'audio/mpeg': new Set(['.mp3']),
  'audio/mp4': new Set(['.m4a', '.mp4']),
  'application/pdf': new Set(['.pdf']),
  'text/plain': new Set(['.txt']),
  'text/csv': new Set(['.csv']),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': new Set(['.docx']),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': new Set(['.xlsx']),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': new Set(['.pptx'])
};

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
};

export function sanitizeUploadName(name: string): string {
  const base = path.basename(String(name || 'arquivo'))
    .replace(/[\r\n\0"'<>]/g, '_')
    .trim();
  return (base || 'arquivo').slice(0, MAX_FILENAME);
}

export function isAllowedUpload(mimeType: string, fileName: string): boolean {
  const mime = String(mimeType || '').toLowerCase().split(';')[0] || '';
  const ext = path.extname(sanitizeUploadName(fileName)).toLowerCase();
  return Boolean(allowedExtensions[mime]?.has(ext));
}

export function uploadFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!isAllowedUpload(file.mimetype, file.originalname)) {
    cb(new Error('Tipo de arquivo não permitido.'));
    return;
  }
  cb(null, true);
}

function hasPrefix(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((value, index) => buffer[index] === value);
}

export function hasValidSignature(buffer: Buffer, mimeType: string): boolean {
  if (!buffer?.length) return false;
  const mime = String(mimeType || '').toLowerCase().split(';')[0] || '';
  if (mime === 'image/jpeg') return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (mime === 'image/png') return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mime === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mime === 'video/mp4' || mime === 'audio/mp4') return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  if (mime === 'audio/ogg') return buffer.subarray(0, 4).toString('ascii') === 'OggS';
  if (mime === 'audio/mpeg') return buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  if (mime.startsWith('application/vnd.openxmlformats-officedocument.')) return buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (mime === 'text/plain' || mime === 'text/csv') return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
  return false;
}

export async function validateStoredUpload(filePath: string, mimeType: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return hasValidSignature(buffer.subarray(0, bytesRead), mimeType);
  } finally {
    await handle.close();
  }
}

export function checkRateLimit(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
