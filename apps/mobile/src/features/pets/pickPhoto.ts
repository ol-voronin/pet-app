import * as ImagePicker from 'expo-image-picker';
import type { PickedPhoto } from './photo';

/** Opens the system photo library. Resolves to null when the user cancels. */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    // Recompress: a phone photo is 3–8 MB, the pet card needs far less.
    quality: 0.8,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  let sizeBytes = asset.fileSize;
  let contentType = asset.mimeType;
  if (sizeBytes === undefined || contentType === undefined) {
    const file = await (await fetch(asset.uri)).blob();
    sizeBytes ??= file.size;
    contentType ??= file.type;
  }
  return { uri: asset.uri, contentType, sizeBytes };
}
