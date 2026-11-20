import { describe, expect, it } from 'vitest';
import { buildMapHtml, GLYPHS, MAPLIBRE } from './mapHtml';

const page = (styleUrl = 'https://tiles.example/style.json') =>
  buildMapHtml({ styleUrl, center: { lat: 50, lon: 36.23 }, zoom: 12, font: 'Noto Sans Bold' });

describe('map page', () => {
  it('loads the pinned library with integrity checks', () => {
    const html = page();
    expect(html).toContain(`src="${MAPLIBRE.js}" integrity="${MAPLIBRE.jsIntegrity}"`);
    expect(html).toContain(`href="${MAPLIBRE.css}" integrity="${MAPLIBRE.cssIntegrity}"`);
    expect(MAPLIBRE.js).toContain(`@${MAPLIBRE.version}/`);
  });

  it('puts the config in as data that cannot end the script', () => {
    const html = page('https://tiles.example/</script><script>alert(1)</script>');
    expect(html.match(/<\/script>/g)).toHaveLength(3);
    expect(html).toContain('"center":[36.23,50]');
  });

  it('has a glyph for every category the API knows', () => {
    expect(Object.keys(GLYPHS).sort()).toEqual(
      ['cafe', 'clinic', 'dog_park', 'groomer', 'other', 'pharmacy', 'shop', 'trainer'].sort(),
    );
  });
});
