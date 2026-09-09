import { isSupportedRegionId } from '../regionDefinitions';

let instance = 0;
export const createAtlasChannel = () => `planli-atlas-${Date.now()}-${++instance}`;
export function parseAtlasMessage(raw, channel) {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  try {
    const message = JSON.parse(raw);
    if (message?.channel !== channel) return null;
    if (['ready', 'error', 'interaction'].includes(message.type)) return { type: message.type };
    if (message.type === 'select' && isSupportedRegionId(message.regionId)) {
      return { type: 'select', regionId: message.regionId };
    }
  } catch { /* Ignore messages outside the atlas protocol. */ }
  return null;
}
