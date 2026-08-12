const { catalogId } = require('./destinationCatalogService');

const MAX_ROUTE_DESTINATION_PREVIEWS = 4;

function routeDestinationEntries(route) {
  return (Array.isArray(route?.destinations) ? route.destinations : [])
    .filter((destination) => destination?.countryId && destination?.cityId)
    .slice(0, MAX_ROUTE_DESTINATION_PREVIEWS);
}

function compactDestinationPreview(destination, catalog) {
  const names = catalog?.names || {};
  return {
    countryId: destination.countryId,
    cityId: destination.cityId,
    name: names.he || names.en || destination.cityName || destination.cityId,
    destinationImage: catalog?.destinationImage || null,
  };
}

async function attachRouteDestinationPreviews(db, routes) {
  const source = Array.isArray(routes) ? routes : [];
  const keys = Array.from(new Set(source.flatMap((route) =>
    routeDestinationEntries(route).map((destination) => catalogId(destination.countryId, destination.cityId))
  )));
  if (!keys.length) return source;

  const refs = keys.map((key) => db.doc(`destinationCatalog/${key}`));
  const snapshots = typeof db.getAll === 'function'
    ? await db.getAll(...refs)
    : await Promise.all(refs.map((ref) => ref.get()));
  const catalogs = new Map(snapshots
    .filter((snapshot) => snapshot?.exists && snapshot.data()?.status === 'active')
    .map((snapshot) => [snapshot.id || snapshot.ref?.id, snapshot.data()]));

  return source.map((route) => ({
    ...route,
    destinationPreviews: routeDestinationEntries(route).map((destination) => {
      const key = catalogId(destination.countryId, destination.cityId);
      return compactDestinationPreview(destination, catalogs.get(key));
    }),
  }));
}

module.exports = {
  MAX_ROUTE_DESTINATION_PREVIEWS,
  attachRouteDestinationPreviews,
  compactDestinationPreview,
  routeDestinationEntries,
};
