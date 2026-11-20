// Raw palette from HANDOFF.md §5 (draft, hues picked by eye — shift before launch).
// Do not use directly in components — use semantic colors from `useTheme()`.
export const palette = {
  brand: '#B5F04F', // fill only, under dark text. White text on it is forbidden (contrast 1.4).
  ink: '#14260F', // main text and dark buttons
  inkEdge: '#0A1507', // edge under dark pills
  forest: '#3F7A12', // small text accents, primary button edge
  cream: '#FAF7F0', // app background
  white: '#FFFFFF', // cards (no shadow)
  moss: '#4A5644', // secondary text
  sand: '#E4DFD2', // dividers
  sandLight: '#F1EDE3', // muted fills (pressed rows, flat buttons)
  brandTint: '#EEF7DC', // round icon plates in lists, «open» badges
  // Map base (design canvas «8а»): calm land, green parks, white roads — pins stay dark on top.
  mapLand: '#EEF0E6',
  mapPark: '#DDEBC8',
  mapWater: '#CFE0E3',
  mapBuilding: '#E3E5DA',
  // Overdue items (design «UI 3 · Дім»): row fill, text, dot.
  amberTint: '#FFE9C7',
  amberDark: '#7A3E00',
  amber: '#E06A00',
  // Second color — warnings only.
  alert: '#B3261E',
} as const;
