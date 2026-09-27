// Keep the large Web-only map engine lazy; native bundles use CityMapCanvas.js.
export const loadCityMapRuntime = () => import('maplibre-gl');
