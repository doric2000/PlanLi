'use strict';
const FLOWS = ['guest', 'auth', 'publish', 'gallery', 'network', 'location'];
function selectFlows(files) {
  const selected = new Set();
  for (const file of files) {
    if (/\.md$|\.test\.[jt]sx?$/.test(file)) continue;
    if (file === 'client/src/components/ExactLocationMapPreview.js') { selected.add('location'); continue; }
    if (file === 'scripts/setupAndroid.ps1') return [...FLOWS];
    if (/^(?:scripts\/e2e\/|client\/(?:\.maestro\/|app\.|package|eas\.json|index\.js|metro\.config|src\/(?:config|navigation)\/))/.test(file)) return [...FLOWS];
    if (/storage\.rules|firestore\.rules|functions\/(?:index|auth|callable|access|guest)|client\/src\/.*(?:[Aa]uth|[Ll]ogin)/.test(file)) return [...FLOWS];
    if (/\/(?:RecommendationHero|MediaGalleryModal|ContentActionMenu|ActionMenu)\.js$/.test(file)) {
      selected.add('gallery');
      continue;
    }
    if (/\/(?:LocationService|useExactPlaceSelection|DestinationFallbackPicker|ExactLocationPicker|ExactLocationConfirmation|SingleDestinationPicker|locationErrors)\.js$/.test(file)) {
      ['publish', 'network'].forEach((flow) => selected.add(flow));
      continue;
    }
    if (/recommendation|Recommendation|community|Community|[Mm]edia|[Pp]hoto|[Gg]allery|[Cc]arousel|ActionMenu/.test(file)) {
      ['publish', 'gallery', 'network'].forEach((flow) => selected.add(flow));
    } else if (/client\/src\//.test(file)) selected.add('guest');
  }
  return FLOWS.filter((flow) => selected.has(flow));
}
function parseFlows(value, files = []) {
  if (value === 'all') return [...FLOWS];
  const flows = value ? [...new Set(value.split(','))] : selectFlows(files);
  if (flows.some((flow) => !FLOWS.includes(flow))) throw new Error(`Unknown flow; choose ${FLOWS.join(',')} or all`);
  return flows;
}
// A broad smoke selection is not proof that an unvisited screen was exercised.
function runtimeFlowsForSource(file) {
  if (file === 'client/src/components/ExactLocationMapPreview.js') return ['location'];
  if (/^client\/src\/config\/(?:firebase|firebaseEnvironment|localEmulators|appCheck(?:\.native)?|secureAuthStorage)\.js$/.test(file)) return [...FLOWS];
  if (/\/(?:HomeScreen|RegionSelectorScreen|AuthEntryScreen)\.js$/.test(file)) return ['guest'];
  if (/\/LoginScreen\.js$/.test(file)) return ['auth'];
  if (/\/(?:CreateRecommendationScreen|SingleDestinationPicker|TravelMediaComposer|useTravelMediaSource|MediaService|RecommendationService)\.js$/.test(file)) return ['publish', 'network'];
  if (/\/(?:RecommendationDetailScreen|RecommendationDetailContent|RecommendationHero|MediaGalleryModal|ContentActionMenu|ActionMenu|mediaAssets)\.js$/.test(file)) return ['gallery'];
  return [];
}
module.exports = { FLOWS, selectFlows, parseFlows, runtimeFlowsForSource };
