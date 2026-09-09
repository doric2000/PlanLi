import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { createAtlasDocument } from '../globe/document.generated';
import { createAtlasChannel, parseAtlasMessage } from '../globe/bridge';

export default function AtlasGlobe({ regionId, active, reducedMotion, spinning, onSelect, onReady, onError, onInteraction }) {
  const view = useRef(null);
  const [ready, setReady] = useState(false);
  const channel = useRef(createAtlasChannel()).current;
  // The document is stable across selections: only small state messages cross the bridge.
  const source = useMemo(() => ({ html: createAtlasDocument(channel) }), [channel]);
  const state = { channel, type: 'state', regionId, active, reducedMotion, spinning };
  const send = () => view.current?.injectJavaScript(`window.planliAtlas?.update(${JSON.stringify(state)});true;`);
  useEffect(() => { if (ready) send(); }, [ready, regionId, active, reducedMotion, spinning]);
  const handleMessage = ({ nativeEvent }) => {
    const message = parseAtlasMessage(nativeEvent.data, channel);
    if (message?.type === 'ready') { setReady(true); send(); onReady(); }
    else if (message?.type === 'select') onSelect(message.regionId);
    else if (message?.type === 'error') onError();
    else if (message?.type === 'interaction') onInteraction();
  };
  return <WebView
    ref={view} source={source} style={styles.view} testID="atlas-globe"
    originWhitelist={['*']} onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
    onMessage={handleMessage} onError={onError} onHttpError={onError}
    onContentProcessDidTerminate={onError} onRenderProcessGone={onError}
    scrollEnabled={false} bounces={false} overScrollMode="never"
    automaticallyAdjustContentInsets={false} setSupportMultipleWindows={false}
    javaScriptCanOpenWindowsAutomatically={false} allowFileAccess={false}
    allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
    mixedContentMode="never" allowsLinkPreview={false}
  />;
}
const styles = StyleSheet.create({ view: { flex: 1, backgroundColor: '#0A2238' } });
