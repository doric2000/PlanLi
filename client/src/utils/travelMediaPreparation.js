import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function buildTravelMediaPreparationActions(transform = {}) {
  const crop = transform?.crop;
  const cropWidth = positive(crop?.width);
  const cropHeight = positive(crop?.height);
  const actions = [];
  if (cropWidth && cropHeight) {
    actions.push({
      crop: {
        originX: Math.max(0, Math.round(Number(crop.originX) || 0)),
        originY: Math.max(0, Math.round(Number(crop.originY) || 0)),
        width: Math.max(1, Math.round(cropWidth)),
        height: Math.max(1, Math.round(cropHeight)),
      },
    });
    const longEdge = Math.max(cropWidth, cropHeight);
    const maxLongEdge = positive(transform.maxLongEdge) || longEdge;
    if (longEdge > maxLongEdge) {
      const scale = maxLongEdge / longEdge;
      actions.push({ resize: {
        width: Math.max(1, Math.round(cropWidth * scale)),
        height: Math.max(1, Math.round(cropHeight * scale)),
      } });
    }
  }
  return actions;
}

export async function prepareTravelMediaSource(uri, transform) {
  if (!transform) return { uri, temporary: false };
  const result = await ImageManipulator.manipulateAsync(
    uri,
    buildTravelMediaPreparationActions(transform),
    {
      compress: Math.max(0, Math.min(1, Number(transform.compress) || 0.94)),
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  const preparedUri = result?.uri || uri;
  return { uri: preparedUri, temporary: preparedUri !== uri };
}

export async function prepareTravelMediaBatch(items, { concurrency = 2 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++;
      const item = list[index];
      results[index] = await prepareTravelMediaSource(item.sourceUri || item.uri, item.transform);
    }
  };
  const workers = Array.from({
    length: Math.min(Math.max(1, concurrency), list.length),
  }, worker);
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure) {
    await Promise.allSettled(results.filter(Boolean).map(deletePreparedTravelMedia));
    throw failure.reason;
  }
  return results;
}

export async function deletePreparedTravelMedia(prepared) {
  if (!prepared?.temporary || typeof prepared.uri !== 'string' || !prepared.uri.startsWith('file:')) return;
  await FileSystem.deleteAsync(prepared.uri, { idempotent: true }).catch(() => {});
}
