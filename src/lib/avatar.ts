import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { AVATAR_MAX_BYTES, AVATAR_SIZES, AVATAR_TYPES } from '../backend/config';

export type AvatarSource = 'library' | 'camera';
export interface AvatarImages {
  full: string;
  thumb: string;
}

function guessType(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType) return asset.mimeType.toLowerCase();
  const m = /^data:(image\/[a-z]+);/.exec(asset.uri);
  if (m) return m[1];
  const ext = asset.uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'unknown';
}

/** Checks type and size of a picked image. Returns an error message or null. */
export function validateAvatar(asset: ImagePicker.ImagePickerAsset): string | null {
  const type = guessType(asset);
  // iOS camera/library may hand us HEIC; it is re-encoded to JPEG below, so we accept it as input only.
  if (!AVATAR_TYPES.includes(type) && type !== 'image/heic' && type !== 'unknown') return 'Use a JPG, PNG or WEBP image.';
  if (asset.fileSize && asset.fileSize > AVATAR_MAX_BYTES) return 'That image is larger than 5 MB.';
  return null;
}

async function resize(uri: string, size: number) {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: size, height: size } }], { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : out.uri;
}

/**
 * Pick (or shoot) a square photo, validate it and produce the two stored sizes (400×400 and 96×96).
 * In production the two files are uploaded to object storage (DigitalOcean Spaces) and only URLs are kept;
 * the prototype stores compact data URIs locally.
 */
export async function pickAvatar(source: AvatarSource): Promise<AvatarImages | { error: string } | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: source === 'camera' ? 'Allow camera access to take a photo.' : 'Allow photo access to choose a picture.' };
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  const err = validateAvatar(asset);
  if (err) return { error: err };
  // Square crop (centre) in case the picker did not crop (web).
  let uri = asset.uri;
  if (asset.width && asset.height && asset.width !== asset.height) {
    const s = Math.min(asset.width, asset.height);
    const cropped = await ImageManipulator.manipulateAsync(uri, [{ crop: { originX: (asset.width - s) / 2, originY: (asset.height - s) / 2, width: s, height: s } }], { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 });
    uri = cropped.uri;
  }
  const [full, thumb] = await Promise.all([resize(uri, AVATAR_SIZES.full), resize(uri, AVATAR_SIZES.thumb)]);
  return { full, thumb };
}
