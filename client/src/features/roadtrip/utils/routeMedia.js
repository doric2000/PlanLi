const LOCAL_IMAGE_URI_PATTERN =
  /^(file:|blob:|data:image\/|content:|ph:|assets-library:)/i;

export const isLocalImageUri = (uri) =>
  typeof uri === "string" && LOCAL_IMAGE_URI_PATTERN.test(uri);

const cloneTripDays = (tripDays) =>
  (Array.isArray(tripDays) ? tripDays : []).map((day) => ({
    ...(day || {}),
    stops: Array.isArray(day?.stops)
      ? day.stops.map((stop) => ({ ...(stop || {}) }))
      : [],
  }));

const isCompleteMediaAsset = (asset) =>
  typeof asset?.assetId === "string" &&
  typeof asset?.large?.url === "string" &&
  typeof asset?.feed?.url === "string" &&
  typeof asset?.thumb?.url === "string";

/**
 * Upload local day/stop images only when the complete route is being saved.
 * Locations are collected in display order and the bounded uploader preserves
 * that order, so descriptors can be attached deterministically.
 */
export async function prepareRouteMedia(tripDays, uploadImageAssets) {
  const nextDays = cloneTripDays(tripDays);
  const pending = [];

  nextDays.forEach((day, dayIndex) => {
    if (isLocalImageUri(day.image)) {
      pending.push({ dayIndex, stopIndex: null, uri: day.image });
    }

    day.stops.forEach((stop, stopIndex) => {
      if (isLocalImageUri(stop.image)) {
        pending.push({ dayIndex, stopIndex, uri: stop.image });
      }
    });
  });

  const uploadedAssets =
    pending.length > 0
      ? await uploadImageAssets(
          pending.map((entry) => entry.uri),
          { limit: Number.POSITIVE_INFINITY }
        )
      : [];

  if (
    uploadedAssets.length !== pending.length ||
    uploadedAssets.some((asset) => !asset?.large?.url)
  ) {
    throw new Error("Route media upload did not return every requested image.");
  }

  pending.forEach((entry, index) => {
    const asset = uploadedAssets[index];
    const target =
      entry.stopIndex == null
        ? nextDays[entry.dayIndex]
        : nextDays[entry.dayIndex].stops[entry.stopIndex];
    delete target.image;
    target.media = asset;
  });

  nextDays.forEach((day) => {
    if (!isLocalImageUri(day.image)) {
      if (day.image && !isCompleteMediaAsset(day.media)) {
        throw new Error("A route day contains media that was not migrated.");
      }
      delete day.image;
    }
    day.stops.forEach((stop) => {
      if (!isLocalImageUri(stop.image)) {
        if (stop.image && !isCompleteMediaAsset(stop.media)) {
          throw new Error("A route stop contains media that was not migrated.");
        }
        delete stop.image;
      }
    });
  });

  return {
    tripDaysData: nextDays,
    uploadedAssets,
  };
}

export const getUploadedAssetPaths = (assets) =>
  Array.from(
    new Set(
      (Array.isArray(assets) ? assets : []).flatMap((asset) =>
        [
          asset?.large?.path,
          asset?.feed?.path,
          asset?.thumb?.path,
        ].filter(Boolean)
      )
    )
  );

/**
 * Release browser object URLs only after the route write has succeeded.
 * They must remain alive on upload/write failure so the user can retry.
 */
export const revokeRouteObjectUrls = (
  tripDays,
  revoke =
    typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function"
      ? URL.revokeObjectURL.bind(URL)
      : null
) => {
  if (typeof revoke !== "function") return;
  const objectUrls = new Set();

  (Array.isArray(tripDays) ? tripDays : []).forEach((day) => {
    if (typeof day?.image === "string" && day.image.startsWith("blob:")) {
      objectUrls.add(day.image);
    }
    (Array.isArray(day?.stops) ? day.stops : []).forEach((stop) => {
      if (typeof stop?.image === "string" && stop.image.startsWith("blob:")) {
        objectUrls.add(stop.image);
      }
    });
  });

  objectUrls.forEach((uri) => {
    try {
      revoke(uri);
    } catch (error) {
      console.warn("Failed to release route object URL:", error);
    }
  });
};
