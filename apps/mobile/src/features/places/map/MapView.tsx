import Constants from 'expo-constants';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefAttributes,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { mapColors } from '@/shared/ui';
import { buildMapHtml, DEFAULT_STYLE_URL } from './mapHtml';
import { commandScript, parseMapEvent, type MapCommand, type MapEvent } from './protocol';

/** What this screen uses of the WebView. */
interface PageHandle {
  injectJavaScript: (script: string) => void;
  reload: () => void;
}
interface PageProps {
  source: { html: string; baseUrl: string };
  originWhitelist: string[];
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
  onError: () => void;
  onContentProcessDidTerminate: () => void;
  javaScriptEnabled: boolean;
  scrollEnabled: boolean;
  bounces: boolean;
  overScrollMode: 'never';
  allowsLinkPreview: boolean;
  setSupportMultipleWindows: boolean;
  textInteractionEnabled: boolean;
  style: StyleProp<ViewStyle>;
  containerStyle: StyleProp<ViewStyle>;
}
/**
 * The library's own prop type intersects the iOS, Android and Windows props and collapses to
 * `never` under `exactOptionalPropertyTypes`; this narrower type lists the props in use.
 */
const Page = WebView as unknown as ComponentType<PageProps & RefAttributes<PageHandle>>;

/** Style URL: `app.json` → `extra.mapStyleUrl` (our own tiles later), else the free public one. */
const configured: unknown = Constants.expoConfig?.extra?.mapStyleUrl;
const STYLE_URL = typeof configured === 'string' && configured ? configured : DEFAULT_STYLE_URL;

export interface MapViewHandle {
  send: (command: MapCommand) => void;
}

export interface MapViewProps {
  initialCenter: { lat: number; lon: number };
  initialZoom: number;
  onEvent: (event: MapEvent) => void;
}

/**
 * The map: one web page with MapLibre GL JS (ADR-0010). Works in Expo Go and in our own build alike.
 * Commands sent before the page is ready are kept and delivered once it is.
 */
export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { initialCenter, initialZoom, onEvent },
  ref,
) {
  const webView = useRef<PageHandle>(null);
  const ready = useRef(false);
  const pending = useRef<MapCommand[]>([]);
  // The page is built once: later centre changes are commands, not a reload.
  const [html] = useState(() =>
    buildMapHtml({
      styleUrl: STYLE_URL,
      center: initialCenter,
      zoom: initialZoom,
      font: 'Noto Sans Bold',
    }),
  );

  const run = useCallback((command: MapCommand) => {
    webView.current?.injectJavaScript(commandScript(command));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      send: (command) => {
        if (ready.current) run(command);
        else pending.current.push(command);
      },
    }),
    [run],
  );

  const onMessage = useCallback(
    (e: { nativeEvent: { data: string } }) => {
      const event = parseMapEvent(e.nativeEvent.data);
      if (!event) return;
      if (event.type === 'ready') {
        ready.current = true;
        pending.current.splice(0).forEach(run);
      }
      onEvent(event);
    },
    [onEvent, run],
  );

  const source = useMemo(() => ({ html, baseUrl: 'https://petapp.local/' }), [html]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: mapColors.land }]}>
      <Page
        ref={webView}
        source={source}
        originWhitelist={['https://*']}
        onMessage={onMessage}
        // The page never navigates; anything that tries (a link in the attribution) is refused.
        onShouldStartLoadWithRequest={(request) => request.url === 'https://petapp.local/'}
        onError={() => {
          onEvent({ type: 'error', fatal: true, message: 'webview_error' });
        }}
        onContentProcessDidTerminate={() => {
          // iOS killed the page (memory): reload it rather than show a blank map.
          ready.current = false;
          webView.current?.reload();
        }}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        allowsLinkPreview={false}
        setSupportMultipleWindows={false}
        textInteractionEnabled={false}
        style={styles.webView}
        containerStyle={styles.webView}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  webView: { flex: 1, backgroundColor: 'transparent' },
});
