const SEED_SPOTS = [
  { id: 'shark-point',    name: 'Shark Point (Clovelly)',     lat: -33.9167, lon: 151.2667 },
  { id: 'yellow-rock',    name: 'Yellow Rock (Royal NP)',     lat: -34.1370, lon: 151.0780 },
  { id: 'bluefish-point', name: 'Bluefish Point (North Head)',lat: -33.8167, lon: 151.2967 },
  { id: 'north-avalon',   name: 'North Avalon',               lat: -33.6280, lon: 151.3340 },
  { id: 'long-reef',      name: 'Long Reef',                  lat: -33.7460, lon: 151.3140 },
  { id: 'cape-banks',     name: 'Cape Banks (La Perouse)',    lat: -33.9930, lon: 151.2440 },
  { id: 'boat-harbour',   name: 'Boat Harbour (Kurnell)',     lat: -34.0440, lon: 151.2280 },
];

const CUSTOM_KEY = 'rfa.customSpots';

function loadCustomSpots() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); }
  catch { return []; }
}
function saveCustomSpot(spot) {
  const all = loadCustomSpots();
  all.push(spot);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(all));
}
function allSpots() {
  return [...SEED_SPOTS, ...loadCustomSpots()];
}
function findSpot(id) {
  return allSpots().find(s => s.id === id);
}
