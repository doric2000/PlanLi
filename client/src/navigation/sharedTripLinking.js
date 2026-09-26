const links = require('../config/publicLinks.generated');

function parseSharedTripPath(path) {
  const target = links.parsePath(path);
  if (!target) return undefined;
  const route = target.kind === 'trip'
    ? { name: 'SharedTrip', params: { token: target.id } }
    : target.kind === 'route'
      ? { name: 'RouteDetail', params: { routeId: target.id } }
      : { name: 'RecommendationDetail', params: { postId: target.id } };
  return { index: 1, routes: [{ name: 'Main' }, route] };
}

const sharedTripLinking = {
  prefixes: [links.origin, ...links.legacyOrigins, links.scheme],
  filter: (url) => !!links.parseUrl(url),
  config: { initialRouteName: 'Main', screens: { SharedTrip: 'trip/:token', RouteDetail: 'route/:routeId',
    RecommendationDetail: 'recommendation/:postId' } },
  getStateFromPath: parseSharedTripPath,
};

module.exports = { sharedTripLinking };
