const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const MAX_CROP_VIEWPORT_WIDTH = 640;

export function boundCropTranslation({
  displayWidth = 0,
  displayHeight = 0,
  viewportWidth = 0,
  viewportHeight = 0,
  zoom = 1,
  translateX = 0,
  translateY = 0,
}) {
  'worklet';
  const maximumX = Math.max(0, ((displayWidth || 0) * zoom - (viewportWidth || 0)) / 2);
  const maximumY = Math.max(0, ((displayHeight || 0) * zoom - (viewportHeight || 0)) / 2);
  return {
    x: Math.max(-maximumX, Math.min(maximumX, translateX)),
    y: Math.max(-maximumY, Math.min(maximumY, translateY)),
  };
}

export function fitCropViewport({
  containerWidth,
  containerHeight,
  aspectRatio,
  maxWidth = MAX_CROP_VIEWPORT_WIDTH,
}) {
  const widthLimit = Number.isFinite(maxWidth) && maxWidth > 0
    ? maxWidth
    : MAX_CROP_VIEWPORT_WIDTH;
  const width = Math.min(widthLimit, Math.max(0, Number(containerWidth) || 0));
  const height = Math.max(0, Number(containerHeight) || 0);
  const ratio = Math.max(0.01, Number(aspectRatio) || 1);
  if (!width || !height) return null;
  const fittedWidth = Math.min(width, height * ratio);
  return { width: fittedWidth, height: fittedWidth / ratio };
}

export function calculateCropRect({
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight,
  zoom = 1,
  translateX = 0,
  translateY = 0,
}) {
  const baseScale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const appliedScale = baseScale * Math.max(1, zoom);
  const displayedWidth = sourceWidth * appliedScale;
  const displayedHeight = sourceHeight * appliedScale;
  const maximumX = Math.max(0, (displayedWidth - viewportWidth) / 2);
  const maximumY = Math.max(0, (displayedHeight - viewportHeight) / 2);
  const boundedX = clamp(translateX, -maximumX, maximumX);
  const boundedY = clamp(translateY, -maximumY, maximumY);
  const width = Math.min(sourceWidth, viewportWidth / appliedScale);
  const height = Math.min(sourceHeight, viewportHeight / appliedScale);
  const originX = clamp(
    (displayedWidth - viewportWidth) / (2 * appliedScale) - boundedX / appliedScale,
    0,
    sourceWidth - width
  );
  const originY = clamp(
    (displayedHeight - viewportHeight) / (2 * appliedScale) - boundedY / appliedScale,
    0,
    sourceHeight - height
  );
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function cropRectToViewportTransform({
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight,
  crop,
  maxZoom = 4,
}) {
  const safeSourceWidth = Math.max(1, Number(sourceWidth) || 1);
  const safeSourceHeight = Math.max(1, Number(sourceHeight) || 1);
  const safeViewportWidth = Math.max(1, Number(viewportWidth) || 1);
  const safeViewportHeight = Math.max(1, Number(viewportHeight) || 1);
  const cropWidth = clamp(Number(crop?.width) || safeSourceWidth, 1, safeSourceWidth);
  const cropHeight = clamp(Number(crop?.height) || safeSourceHeight, 1, safeSourceHeight);
  const cropOriginX = clamp(Number(crop?.originX) || 0, 0, safeSourceWidth - cropWidth);
  const cropOriginY = clamp(Number(crop?.originY) || 0, 0, safeSourceHeight - cropHeight);
  const baseScale = Math.max(
    safeViewportWidth / safeSourceWidth,
    safeViewportHeight / safeSourceHeight
  );
  const zoom = clamp(Math.max(
    safeViewportWidth / (baseScale * cropWidth),
    safeViewportHeight / (baseScale * cropHeight)
  ), 1, Math.max(1, Number(maxZoom) || 4));
  const appliedScale = baseScale * zoom;
  const displayedWidth = safeSourceWidth * appliedScale;
  const displayedHeight = safeSourceHeight * appliedScale;
  const bounded = boundCropTranslation({
    displayWidth: safeSourceWidth * baseScale,
    displayHeight: safeSourceHeight * baseScale,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
    zoom,
    translateX: (displayedWidth - safeViewportWidth) / 2 - cropOriginX * appliedScale,
    translateY: (displayedHeight - safeViewportHeight) / 2 - cropOriginY * appliedScale,
  });
  return { zoom, translateX: bounded.x, translateY: bounded.y };
}
