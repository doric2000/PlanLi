const finiteDimension = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function travelMediaAspectRatio(aspect = [1, 1]) {
  const width = finiteDimension(aspect?.[0]) || 1;
  const height = finiteDimension(aspect?.[1]) || 1;
  return width / height;
}

export function defaultTravelMediaCrop(width, height, aspect = [1, 1]) {
  const sourceWidth = finiteDimension(width);
  const sourceHeight = finiteDimension(height);
  if (!sourceWidth || !sourceHeight) return null;
  const targetAspect = travelMediaAspectRatio(aspect);
  const sourceAspect = sourceWidth / sourceHeight;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceAspect > targetAspect) cropWidth = sourceHeight * targetAspect;
  if (sourceAspect < targetAspect) cropHeight = sourceWidth / targetAspect;
  return {
    originX: Math.max(0, Math.round((sourceWidth - cropWidth) / 2)),
    originY: Math.max(0, Math.round((sourceHeight - cropHeight) / 2)),
    width: Math.max(1, Math.round(cropWidth)),
    height: Math.max(1, Math.round(cropHeight)),
  };
}

export function travelMediaIdentity(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return String(
    item.sourceId || item.assetId || item.id || item.localReference?.key ||
    item.asset?.assetId || item.uri || item.previewUri || ''
  );
}

export function travelMediaUri(item) {
  if (typeof item === 'string') return item;
  return [item?.previewUri, item?.uri, item?.sourceUri].find((value) => typeof value === 'string') || '';
}

export function createTravelMediaDescriptor(item, {
  aspect = [1, 1],
  maxLongEdge = 1600,
  compress = 0.94,
  newSource = false,
} = {}) {
  if (!item) return null;
  const source = typeof item === 'string' ? { uri: item } : item;
  const asset = source.asset || null;
  const uri = source.uri || source.sourceUri || source.previewUri || '';
  const previewUri = source.previewUri || uri;
  const sourceId = source.sourceId || source.assetId || source.id || source.localReference?.key ||
    asset?.assetId || uri;
  if (!sourceId || (!previewUri && !asset)) return null;
  const width = finiteDimension(source.width);
  const height = finiteDimension(source.height);
  const isRemote = Boolean(asset || source.type === 'remote');
  const crop = source.crop || source.transform?.crop ||
    (newSource ? defaultTravelMediaCrop(width, height, aspect) : null);
  const transform = source.transform
    ? { ...source.transform, ...(crop ? { crop } : {}) }
    : (newSource ? {
        version: 1,
        crop,
        maxLongEdge,
        compress,
        format: 'jpeg',
      } : null);
  return {
    ...source,
    id: String(source.id || sourceId),
    sourceId: String(sourceId),
    type: isRemote ? 'remote' : 'local',
    uri,
    previewUri,
    ...(source.assetId ? { assetId: source.assetId } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(crop ? { crop } : {}),
    ...(transform ? { transform } : {}),
    persistence: source.persistence || (isRemote || source.localReference ? 'ready' : 'selected'),
  };
}

export function mergeTravelMediaSelection(current, additions, options = {}) {
  const maximum = Math.max(0, Number(options.maxItems) || 0);
  const output = [];
  const seen = new Set();
  [...(current || []), ...(additions || [])].forEach((item) => {
    const descriptor = createTravelMediaDescriptor(item, options);
    const identity = travelMediaIdentity(descriptor);
    if (!descriptor || !identity || seen.has(identity) || (maximum && output.length >= maximum)) return;
    seen.add(identity);
    output.push(descriptor);
  });
  return output;
}

export function updateTravelMediaCrop(item, crop) {
  if (!item || !crop || item.type === 'remote' || !item.transform) return item;
  return {
    ...item,
    crop,
    transform: { ...item.transform, crop },
  };
}

/**
 * Pair upload results with the descriptors that produced them without relying
 * on completion order. The returned map is keyed by the stable descriptor
 * identity, so reordering the visible list cannot associate an asset with the
 * wrong photo during an edit.
 */
export function pairTravelMediaUploads(items, uploadedAssets) {
  const pairs = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const identity = travelMediaIdentity(item);
    const asset = Array.isArray(uploadedAssets) ? uploadedAssets[index] : null;
    if (identity && asset) pairs.set(identity, asset);
  });
  return pairs;
}

export function removedTravelMediaItems(current, next) {
  const nextIdentities = new Set((next || []).map(travelMediaIdentity).filter(Boolean));
  return (current || []).filter((item) => {
    const identity = travelMediaIdentity(item);
    return identity && !nextIdentities.has(identity);
  });
}

export function queueMediaFromDescriptor(item) {
  if (!item) return null;
  if (item.asset) return {
    asset: item.asset,
    ...(item.slot ? { slot: item.slot } : {}),
  };
  return {
    uri: item.sourceUri || item.uri,
    ...(item.mediaId ? { mediaId: item.mediaId } : {}),
    ...(item.localReference ? { localReference: item.localReference } : {}),
    ...(item.preparedAsset ? { preparedAsset: item.preparedAsset } : {}),
    ...(item.transform ? { transform: item.transform } : {}),
    ...(item.slot ? { slot: item.slot } : {}),
  };
}
