let _map, _markers = {};

function initMap(onSelect) {
  _map = L.map('map', { zoomControl: true }).setView([-33.87, 151.22], 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(_map);

  renderMarkers(onSelect);

  let pressTimer;
  _map.on('mousedown touchstart', (e) => {
    pressTimer = setTimeout(() => {
      const ll = e.latlng;
      const ev = new CustomEvent('map:longpress', { detail: { lat: ll.lat, lon: ll.lng } });
      window.dispatchEvent(ev);
    }, 600);
  });
  _map.on('mouseup touchend mousemove touchmove', () => clearTimeout(pressTimer));
}

function renderMarkers(onSelect) {
  Object.values(_markers).forEach(m => m.remove());
  _markers = {};
  for (const s of allSpots()) {
    const m = L.marker([s.lat, s.lon]).addTo(_map).bindPopup(`<b>${s.name}</b>`);
    m.on('click', () => onSelect(s.id));
    _markers[s.id] = m;
  }
}

function focusSpot(id) {
  const s = findSpot(id);
  if (!s || !_map) return;
  _map.setView([s.lat, s.lon], 13);
  _markers[id]?.openPopup();
}
