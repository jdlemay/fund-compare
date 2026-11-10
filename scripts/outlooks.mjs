// Published 10-year return forecasts from the firms' own pages. Update when they publish new ones
// (Vanguard: roughly quarterly; J.P. Morgan: each October). Values are annualized, nominal, in USD.
// Only figures confirmed on the publisher's own site are included.
export const SOURCES = {
  vanguard: {
    name: 'Vanguard',
    asOf: '2026-09-30',
    published: '2026-10-21',
    horizon: '10 years',
    url: 'https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html',
    note: 'Vanguard Capital Markets Model, September 30, 2026 run. Shown as a likely range.',
  },
  jpm: {
    name: 'J.P. Morgan',
    asOf: '2026-09-30',
    published: '2026-10-19',
    horizon: '10–15 years',
    url: 'https://am.jpmorgan.com/us/en/asset-management/adv/about-us/media/press-releases/jp-morgan-releases-2027-long-term-capital-market-assumptions/',
    note: '2027 Long-Term Capital Market Assumptions.',
  },
};

// Asset-class forecasts. Vanguard gives [low, high]; J.P. Morgan gives a single number.
export const OUTLOOK = {
  usStocks:     { label: 'US stocks',                       vanguard: [0.048, 0.068], jpm: 0.075, jpmLabel: 'US large cap' },
  usSmall:      { label: 'US stocks (broad market)',        vanguard: [0.048, 0.068] },
  devIntl:      { label: 'Developed international stocks',  vanguard: [0.053, 0.073] },
  emStocks:     { label: 'Emerging-market stocks',          vanguard: [0.037, 0.057], jpm: 0.071 },
  global:       { label: 'Global stocks',                   jpm: 0.075 },
  usAgg:        { label: 'US investment-grade bonds',       vanguard: [0.051, 0.061] },
  treasuries:   { label: 'US Treasuries',                   jpm: 0.046, jpmLabel: 'US intermediate Treasuries' },
  corp:         { label: 'Investment-grade corporate bonds', jpm: 0.061 },
  highYield:    { label: 'High-yield bonds',                vanguard: [0.054, 0.064], jpm: 0.067 },
  intlBonds:    { label: 'International bonds (hedged)',    vanguard: [0.052, 0.062], jpm: 0.053, jpmLabel: 'Global aggregate bonds' },
  gold:         { label: 'Gold',                            jpm: 0.055 },
  commodities:  { label: 'Broad commodities',               jpm: 0.048 },
  sixtyForty:   { label: '60% stocks / 40% bonds',          jpm: 0.07 },
};

// Which forecast applies to each fund: by category, with per-fund overrides.
const BY_CATEGORY = {
  'us-large': 'usStocks', 'us-total': 'usStocks', 'growth-value': 'usStocks', 'dividend': 'usStocks',
  'sector': 'usStocks', 'us-mid-small': 'usSmall', 'intl': 'devIntl', 'global': 'global', 'bond': 'usAgg',
};
const BY_SYMBOL = {
  VWO: 'emStocks', IEMG: 'emStocks', EEM: 'emStocks', SCHE: 'emStocks',
  TLT: 'treasuries', IEF: 'treasuries',
  VCIT: 'corp', LQD: 'corp',
  HYG: 'highYield',
  BNDX: 'intlBonds',
  GLD: 'gold', IAU: 'gold', GLDM: 'gold',
  PDBC: 'commodities', DBC: 'commodities',
  // Not a plain match to any published class: leave without a forecast.
  TIP: null, VTIP: null, SCHP: null, BSV: null, MUB: null, VTEB: null, SLV: null,
};
export function outlookKeyFor(symbol, category) {
  if (symbol in BY_SYMBOL) return BY_SYMBOL[symbol];
  return BY_CATEGORY[category] ?? null;
}
export const TSP_OUTLOOK = { 'C Fund': 'usStocks', 'S Fund': 'usSmall', 'I Fund': 'devIntl', 'F Fund': 'usAgg' };
export const MIX_OUTLOOK = { c60: 'sixtyForty' };
