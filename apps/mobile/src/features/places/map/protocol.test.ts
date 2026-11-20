import { describe, expect, it } from 'vitest';
import { commandScript, parseMapEvent, radiusForRegion, toPins } from './protocol';

describe('messages from the map page', () => {
  it('accepts what the page sends', () => {
    expect(parseMapEvent('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(
      parseMapEvent(
        JSON.stringify({
          type: 'region',
          bbox: [36.1, 49.9, 36.3, 50.1],
          center: { lat: 50, lon: 36.2 },
          zoom: 12.5,
        }),
      ),
    ).toMatchObject({ type: 'region', center: { lat: 50, lon: 36.2 } });
    expect(parseMapEvent('{"type":"longPress","lat":50,"lon":36.2}')).toEqual({
      type: 'longPress',
      lat: 50,
      lon: 36.2,
    });
  });

  it('ignores anything else: broken JSON, unknown types, impossible coordinates', () => {
    expect(parseMapEvent('not json')).toBeNull();
    expect(parseMapEvent('{"type":"navigate","url":"https://example.com"}')).toBeNull();
    expect(parseMapEvent('{"type":"longPress","lat":120,"lon":36.2}')).toBeNull();
    expect(parseMapEvent('{"type":"select","id":""}')).toBeNull();
  });
});

describe('messages to the map page', () => {
  it('sends pins without names or addresses', () => {
    const pins = toPins([
      {
        id: 'a',
        category: 'clinic',
        name: 'Довіра',
        lat: 50,
        lon: 36.2,
        open247: true,
        mine: false,
      },
    ]);
    expect(pins.features[0]).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [36.2, 50] },
      properties: { id: 'a', category: 'clinic', mine: false },
    });
  });

  it('cannot break out of the page script', () => {
    const script = commandScript({
      type: 'select',
      pin: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [36.2, 50] },
        properties: { id: 'a', category: 'clinic', mine: false, label: '</script><b>' },
      },
    });
    expect(script).not.toContain('</script>');
    expect(script).toMatch(/^window\.__petMap && window\.__petMap\.receive\(\{.*\}\); true;$/);
  });
});

describe('radiusForRegion', () => {
  it('covers the screen from its visible middle to the farthest corner', () => {
    // Roughly 2.9 × 2.2 km around Kharkiv centre.
    const radius = radiusForRegion({ lat: 50, lon: 36.23 }, [36.21, 49.99, 36.25, 50.01]);
    expect(radius).toBeGreaterThan(1700);
    expect(radius).toBeLessThanOrEqual(1900);
    expect(radius % 100).toBe(0);
  });

  it('stays between 300 m and 50 km', () => {
    expect(radiusForRegion({ lat: 50, lon: 36.23 }, [36.2299, 49.9999, 36.2301, 50.0001])).toBe(
      300,
    );
    expect(radiusForRegion({ lat: 49, lon: 31 }, [22, 44, 40, 52])).toBe(50_000);
  });
});
