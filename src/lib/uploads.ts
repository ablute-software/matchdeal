// MatchDeal — image uploads. Everything goes to the `matchdeal` Storage
// bucket (created for this app specifically) — NEVER the Sherlock Deal
// `data-room` bucket, per the integration adenda. The bucket is public, so
// uploaded URLs are plain, permanent, and need no signing/refresh logic on
// the client — appropriate here because everything uploaded through this
// picker (profile photo, entity logo, gallery images) is something the
// uploader is choosing to show to the other side of a swipe deck, not a
// data-room document.
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const MAX_DIMENSION = 1600; // matches ImagePicker quality setting below, not resized separately
const BUCKET = 'matchdeal';

export type UploadKind = 'profile-photo' | 'entity-logo' | 'gallery';

function extensionOf(uri: string, fallback = 'jpg'): string {
  const match = /\.(\w+)(?:\?.*)?$/.exec(uri);
  return (match?.[1] ?? fallback).toLowerCase();
}

function contentTypeFor(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Opens the native picker, uploads the chosen image to
 * `matchdeal/{ownerId}/{kind}/{uuid}.{ext}`, and returns its public URL.
 * Returns null if the user cancelled or permission was denied — callers
 * should treat null as "no change", not as an error to surface.
 */
export async function pickAndUploadImage(ownerId: string, kind: UploadKind): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: kind !== 'gallery',
    aspect: kind === 'entity-logo' ? [1, 1] : [4, 5],
    quality: 0.8,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  return uploadAsset(ownerId, kind, result.assets[0]);
}

/** Same as pickAndUploadImage, but lets the caller pick several at once (gallery, up to 5). */
export async function pickAndUploadImages(ownerId: string, max: number): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: max,
    quality: 0.8,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return [];

  const urls: string[] = [];
  for (const asset of result.assets) {
    const url = await uploadAsset(ownerId, 'gallery', asset);
    if (url) urls.push(url);
  }
  return urls;
}

async function uploadAsset(ownerId: string, kind: UploadKind, asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  if (!asset.base64) return null;
  const ext = extensionOf(asset.uri);
  const path = `${ownerId}/${kind}/${cryptoRandomId()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(asset.base64), { contentType: contentTypeFor(ext), upsert: false });
  if (error) return null;

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function cryptoRandomId(): string {
  // expo/react-native has crypto.randomUUID via react-native-url-polyfill in
  // recent runtimes, but not guaranteed on every device — this avoids a hard
  // dependency for something that only needs to be unique, not secure.
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
