// Parse only the route emitted by createTripShare. Never pass external query
// strings or percent-encoded input to React Navigation's generic URL parser.
function parseSharedTripPath(path) {
  if (typeof path !== 'string' || path.length > 256) return undefined;
  const match = /^\/?shared-trip\/([A-Za-z0-9_-]{40,128})$/.exec(path);
  if (!match || match[0] !== path) return undefined;
  return { routes: [{ name: 'SharedTrip', params: { token: match[1] } }] };
}

const sharedTripLinking = {
  prefixes: ['com.planli.planlitravels://'],
  config: { screens: { SharedTrip: 'shared-trip/:token' } },
  getStateFromPath: parseSharedTripPath,
};

module.exports = { sharedTripLinking };
