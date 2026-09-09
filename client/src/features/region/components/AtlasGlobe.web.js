import { useEffect, useMemo, useRef, useState } from 'react';
import { createAtlasDocument } from '../globe/document.generated';
import { createAtlasChannel, parseAtlasMessage } from '../globe/bridge';

export default function AtlasGlobe({ regionId, active, reducedMotion, spinning, onSelect, onReady, onError, onInteraction }) {
  const view = useRef(null);
  const [ready, setReady] = useState(false);
  const channel = useRef(createAtlasChannel()).current;
  const document = useMemo(() => createAtlasDocument(channel), [channel]);
  const callbacks = useRef({ onSelect, onReady, onError, onInteraction });
  callbacks.current = { onSelect, onReady, onError, onInteraction };
  useEffect(() => {
    const receive = (event) => {
      if (event.source !== view.current?.contentWindow) return;
      const message = parseAtlasMessage(event.data, channel);
      if (message?.type === 'ready') { setReady(true); callbacks.current.onReady(); }
      else if (message?.type === 'select') callbacks.current.onSelect(message.regionId);
      else if (message?.type === 'error') callbacks.current.onError();
      else if (message?.type === 'interaction') callbacks.current.onInteraction();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [channel]);
  useEffect(() => {
    if (ready) view.current?.contentWindow?.postMessage(JSON.stringify({
      channel, type: 'state', regionId, active, reducedMotion, spinning,
    }), '*');
  }, [channel, ready, regionId, active, reducedMotion, spinning]);
  return <iframe ref={view} srcDoc={document} title="גלובוס אינטראקטיבי של PlanLi"
    sandbox="allow-scripts" onError={onError} data-testid="atlas-globe"
    style={{ display: 'block', border: 0, width: '100%', height: '100%', background: '#0A2238' }} />;
}
