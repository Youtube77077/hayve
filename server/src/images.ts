import sharp from 'sharp';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];
export const AVATAR_SIZES = { full: 400, thumb: 96 } as const;

/** Detects the real image type from magic bytes (never trust the file name or header). */
export function sniffImageType(buf: Uint8Array): AvatarType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(0, 4)) === 'RIFF' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export function checkAvatarUpload(buf: Uint8Array): string | null {
  if (buf.length === 0) return 'The file is empty';
  if (buf.length > AVATAR_MAX_BYTES) return 'Pictures can be at most 5 MB';
  if (!sniffImageType(buf)) return 'Use a JPG, PNG or WEBP image';
  return null;
}

/** Square crop (centre) and resize to the stored sizes. Strips metadata (EXIF, GPS). */
export async function renderAvatar(buf: Uint8Array) {
  const base = sharp(buf, { limitInputPixels: 40_000_000 }).rotate();
  const [full, thumb] = await Promise.all([
    base.clone().resize(AVATAR_SIZES.full, AVATAR_SIZES.full, { fit: 'cover', position: 'attention' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer(),
    base.clone().resize(AVATAR_SIZES.thumb, AVATAR_SIZES.thumb, { fit: 'cover', position: 'attention' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer(),
  ]);
  return { full, thumb };
}
