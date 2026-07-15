export const WALNUT_DISTRICTS = [
  { id: 'manjimup', name: 'Manjimup, WA', region: 'South West WA', lat: -34.24, lng: 116.14 },
  { id: 'nannup', name: 'Nannup, WA', region: 'South West WA', lat: -33.98, lng: 115.76 },
  { id: 'pemberton', name: 'Pemberton, WA', region: 'South West WA', lat: -34.44, lng: 116.03 },
  { id: 'donnybrook', name: 'Donnybrook, WA', region: 'South West WA', lat: -33.58, lng: 115.82 },
  { id: 'bridgetown', name: 'Bridgetown, WA', region: 'South West WA', lat: -33.96, lng: 116.14 },
  { id: 'goulburn', name: 'Goulburn Valley, VIC', region: 'Victoria', lat: -36.38, lng: 145.40 },
  { id: 'riverina', name: 'Riverina, NSW', region: 'New South Wales', lat: -34.28, lng: 146.06 },
  { id: 'adelaide_hills', name: 'Adelaide Hills, SA', region: 'South Australia', lat: -34.98, lng: 138.86 },
  { id: 'tasmania', name: 'Tasmania (Various)', region: 'Tasmania', lat: -41.45, lng: 146.00 },
];

export const PHENOLOGY_STAGES = [
  { name: 'Dormancy', startMonth: 0, endMonth: 1.5, color: 'bg-slate-200', textColor: 'text-slate-600' },
  { name: 'Bloom', startMonth: 1.5, endMonth: 3.5, color: 'bg-emerald-200', textColor: 'text-emerald-700' },
  { name: 'Nut Dev', startMonth: 3.5, endMonth: 6.5, color: 'bg-blue-200', textColor: 'text-blue-700' },
  { name: 'Harvest', startMonth: 6.5, endMonth: 9.5, color: 'bg-amber-200', textColor: 'text-amber-700' },
  { name: 'Post-Harvest', startMonth: 9.5, endMonth: 12, color: 'bg-stone-200', textColor: 'text-stone-600' },
];

export const SEASONS = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22'];

export const DEFAULT_CHEMICALS = [
  'Kocide (Copper Hydroxide)',
  'Nordox (Cuprous Oxide)',
  'Dithane (Mancozeb)',
  'Regalis (Prohexadione-calcium)',
  'Copper + Mancozeb Mix',
  'Champ (Copper Hydroxide)',
  'Tri-Base Blue (Tribasic Copper Sulphate)',
  'Bordeaux Mixture',
  'Lime Sulphur'
];

export const DEFAULT_BIOLOGICALS = [
  'Serenade (Bacillus subtilis)',
  'Double Nickel (Bacillus amyloliquefaciens)',
  'Bacillus thuringiensis (Bt)',
  'Trichoderma harzianum'
];

export const DEFAULT_CARRIERS = [
  'Water',
  'Oil-based Carrier',
  'Liquid Fertilizer'
];

export const DEFAULT_ADJUVANTS = [
  'None',
  'Du-Wett (Spreader)',
  'Bond (Sticker)',
  'Li-700 (Buffer/Penetrant)',
  'Pulse (Penetrant)',
  'Agral (Wetting Agent)',
  'Hasten (Spray Oil)',
  'Synertrol Horti Oil'
];

export const MODULE_THEMES = {
  blight: {
    id: 'blight',
    name: 'Blight Risk',
    accent: 'rose',
    color: '#f43f5e', // rose-500
    bg: 'bg-rose-50',
    border: 'border-rose-100',
    text: 'text-rose-600',
    lightText: 'text-rose-500',
    icon: 'Bug'
  },
  nutrition: {
    id: 'nutrition',
    name: 'Nutrition',
    accent: 'emerald',
    color: '#10b981', // emerald-500
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    text: 'text-emerald-600',
    lightText: 'text-emerald-500',
    icon: 'Beaker'
  },
  water: {
    id: 'water',
    name: 'Water Monitoring',
    accent: 'sky',
    color: '#0ea5e9', // sky-500
    bg: 'bg-sky-50',
    border: 'border-sky-100',
    text: 'text-sky-600',
    lightText: 'text-sky-500',
    icon: 'Droplets'
  },
  financials: {
    id: 'financials',
    name: 'Financials',
    accent: 'amber',
    color: '#f59e0b', // amber-500
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    text: 'text-amber-600',
    lightText: 'text-amber-500',
    icon: 'DollarSign'
  }
};

export const WALNUT_AGRONOMIC_IDEALS = {
  soil: {
    'Nitrogen': { min: 20, max: 40, unit: 'mg/kg', label: 'Nitrate-N' },
    'Phosphorus': { min: 40, max: 60, unit: 'mg/kg', label: 'Colwell P' },
    'Potassium': { min: 150, max: 250, unit: 'mg/kg', label: 'Colwell K' },
    'pH': { min: 6.0, max: 7.5, unit: 'CaCl2', label: 'Soil Acidity' },
    'Organic Carbon': { min: 1.5, max: 3.0, unit: '%', label: 'Soil Health' },
    'Zinc': { min: 1.0, max: 2.0, unit: 'mg/kg', label: 'DTPA' },
    'Boron': { min: 0.5, max: 1.5, unit: 'mg/kg', label: 'Hot Water' },
    'Calcium': { min: 65, max: 75, unit: '%', label: 'Exch. %' },
    'Magnesium': { min: 10, max: 15, unit: '%', label: 'Exch. %' },
    'Sodium': { min: 0, max: 2, unit: '%', label: 'Exch. %' },
    'CEC': { min: 10, max: 20, unit: 'meq/100g', label: 'CEC' }
  },
  leaf: {
    'Nitrogen': { min: 2.2, max: 3.2, unit: '%', label: 'Total N' },
    'Phosphorus': { min: 0.1, max: 0.3, unit: '%', label: 'Total P' },
    'Potassium': { min: 1.0, max: 2.0, unit: '%', label: 'Total K' },
    'Calcium': { min: 1.0, max: 2.5, unit: '%', label: 'Total Ca' },
    'Magnesium': { min: 0.3, max: 0.6, unit: '%', label: 'Total Mg' },
    'Zinc': { min: 20, max: 50, unit: 'mg/kg', label: 'Total Zn' },
    'Boron': { min: 30, max: 100, unit: 'mg/kg', label: 'Total B' }
  },
  water: {
    'pH': { min: 6.5, max: 8.5, unit: 'pH', label: 'Acidity' },
    'EC': { min: 0, max: 2.0, unit: 'dS/m', label: 'Salinity' },
    'Chloride': { min: 0, max: 100, unit: 'mg/L', label: 'Chloride' },
    'Sodium': { min: 0, max: 50, unit: 'mg/L', label: 'Sodium' },
    'SAR': { min: 0, max: 3.0, unit: 'ratio', label: 'Sodicity' }
  }
};
