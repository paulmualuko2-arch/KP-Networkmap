/* BDIV10 mobile web map (Leaflet) */

// --- helpers
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty = (v) => (v === null || v === undefined || String(v).trim() === '' ? '—' : String(v).trim());
const norm = (s) => pretty(s).toLowerCase();

// --- map + basemaps
const map = L.map('map', { zoomControl: true });

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const carto = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 20,
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
});

function setBasemap(key){
  if (key === 'carto'){
    if (map.hasLayer(osm)) map.removeLayer(osm);
    if (!map.hasLayer(carto)) carto.addTo(map);
  } else {
    if (map.hasLayer(carto)) map.removeLayer(carto);
    if (!map.hasLayer(osm)) osm.addTo(map);
  }
}

// --- layers
let mvLayer, txLayer;
let mvGeojson, txGeojson;

const mvStyle = { weight: 3, opacity: 0.9 };
function txMarker(latlng){
  return L.circleMarker(latlng, { radius: 6, weight: 1, opacity: 0.9, fillOpacity: 0.9 });
}

function buildPopup(kind, props){
  if (kind === 'Transformer'){
    const name = props.Name16 || props.name || props.NAME || '';
    const feeder = props['Feeder o32'] || props.feeder || props['Feeder o25'] || '';
    return `
      <div style="min-width:220px">
        <div style="font-weight:800;margin-bottom:6px">Transformer</div>
        <div><b>Name/No:</b> ${escapeHtml(pretty(name))}</div>
        <div><b>Feeder:</b> ${escapeHtml(pretty(feeder))}</div>
      </div>
    `;
  }
  const feeder = props['Feeder o25'] || props.feeder || '';
  const sec = props.Sect_name || props.Section || props.SectName || '';
  return `
    <div style="min-width:220px">
      <div style="font-weight:800;margin-bottom:6px">MV Line</div>
      <div><b>Feeder:</b> ${escapeHtml(pretty(feeder))}</div>
      <div><b>Section:</b> ${escapeHtml(pretty(sec))}</div>
    </div>
  `;
}

function fitToLayers(){
  const group = L.featureGroup([mvLayer, txLayer].filter(Boolean));
  const b = group.getBounds();
  if (b && b.isValid()) map.fitBounds(b.pad(0.05));
  else map.setView([-1.286389, 36.817223], 12); // fallback Nairobi
}

// --- data loading
async function loadGeoJSON(){
  const [mv, tx] = await Promise.all([
    fetch('mv_lines.geojson').then(r => r.json()),
    fetch('transformers.geojson').then(r => r.json())
  ]);

  mvGeojson = mv;
  txGeojson = tx;

  mvLayer = L.geoJSON(mvGeojson, {
    style: mvStyle,
    onEachFeature: (f, layer) => {
      layer.bindPopup(buildPopup('MV', f.properties || {}));
      layer.on('click', () => openSheet(true));
    }
  }).addTo(map);

  txLayer = L.geoJSON(txGeojson, {
    pointToLayer: (f, latlng) => txMarker(latlng),
    onEachFeature: (f, layer) => {
      layer.bindPopup(buildPopup('Transformer', f.properties || {}));
      layer.on('click', () => openSheet(true));
    }
  }).addTo(map);

  // color styling (after creation so it always applies)
  mvLayer.setStyle({ color: '#2ad', weight: 3 });
  txLayer.eachLayer(l => l.setStyle({ color: '#fbb', fillColor: '#f66' }));

  buildFeederList();
  buildSearchIndex();
  fitToLayers();
}

const feeders = new Set();
function feederOfProps(props){
  return props?.['Feeder o25'] || props?.['Feeder o32'] || props?.feeder || '';
}

function buildFeederList(){
  feeders.clear();
  (mvGeojson.features || []).forEach(f => feeders.add(pretty(feederOfProps(f.properties))));
  (txGeojson.features || []).forEach(f => feeders.add(pretty(feederOfProps(f.properties))));
  const list = Array.from(feeders).filter(f => f !== '—').sort((a,b)=>a.localeCompare(b));

  const sel = $('feederSelect');
  sel.innerHTML = '<option value="">All feeders</option>' + list.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
}

// --- search index + UI
let searchItems = []; // {type, title, subtitle, feeder, latlng, layerRef}
function buildSearchIndex(){
  searchItems = [];

  txLayer.eachLayer(layer => {
    const f = layer.feature || {};
    const p = f.properties || {};
    const name = p.Name16 || p.name || p.NAME || '';
    const feeder = feederOfProps(p);
    const latlng = layer.getLatLng();
    searchItems.push({
      type: 'Transformer',
      title: pretty(name),
      subtitle: feeder ? `Feeder: ${pretty(feeder)}` : 'Transformer',
      feeder: pretty(feeder),
      latlng,
      layerRef: layer
    });
  });

  mvLayer.eachLayer(layer => {
    const f = layer.feature || {};
    const p = f.properties || {};
    const feeder = p['Feeder o25'] || p.feeder || '';
    const center = layer.getBounds ? layer.getBounds().getCenter() : null;
    if (!center) return;
    searchItems.push({
      type: 'Feeder',
      title: pretty(feeder),
      subtitle: 'MV feeder section',
      feeder: pretty(feeder),
      latlng: center,
      layerRef: layer
    });
  });
}

function openSheet(open){
  $('sheet').classList.toggle('open', !!open);
}

$('btnMenu').addEventListener('click', () => openSheet(true));
$('sheetHandle').addEventListener('click', () => openSheet(!$('sheet').classList.contains('open')));

// feeder filter
$('feederSelect').addEventListener('change', () => {
  const v = $('feederSelect').value;
  applyFeederFilter(v);
  $('btnZoomFeeder').disabled = !v;
});

function applyFeederFilter(feeder){
  const fval = norm(feeder);
  if (!fval){
    mvLayer.clearLayers(); mvLayer.addData(mvGeojson);
    txLayer.clearLayers(); txLayer.addData(txGeojson);
    mvLayer.setStyle({ color: '#2ad', weight: 3 });
    txLayer.eachLayer(l => l.setStyle({ color: '#fbb', fillColor: '#f66' }));
  } else {
    mvLayer.clearLayers();
    txLayer.clearLayers();

    const mvFiltered = { ...mvGeojson, features: (mvGeojson.features||[]).filter(ft => norm(ft.properties?.['Feeder o25'] || ft.properties?.feeder) === fval) };
    const txFiltered = { ...txGeojson, features: (txGeojson.features||[]).filter(ft => norm(feederOfProps(ft.properties)) === fval) };

    mvLayer.addData(mvFiltered);
    txLayer.addData(txFiltered);

    mvLayer.setStyle({ color: '#2ad', weight: 3 });
    txLayer.eachLayer(l => l.setStyle({ color: '#fbb', fillColor: '#f66' }));
  }

  // rebuild search index to match current layers
  buildSearchIndex();
  $('results').innerHTML = '';
  $('resultsMeta').textContent = feeder ? `Filtered to: ${feeder}` : 'Type to search…';
}

// basemap select
$('basemapSelect').addEventListener('change', (e) => setBasemap(e.target.value));

// feeder zoom
$('btnZoomFeeder').addEventListener('click', () => {
  const feeder = $('feederSelect').value;
  if (!feeder) return;
  zoomToFeeder(feeder);
});

function zoomToFeeder(feeder){
  const fval = norm(feeder);
  const layers = [];
  mvLayer.eachLayer(l => {
    const p = l.feature?.properties || {};
    if (norm(p['Feeder o25'] || p.feeder) === fval) layers.push(l);
  });
  txLayer.eachLayer(l => {
    const p = l.feature?.properties || {};
    if (norm(feederOfProps(p)) === fval) layers.push(l);
  });
  const group = L.featureGroup(layers);
  const b = group.getBounds();
  if (b && b.isValid()) map.fitBounds(b.pad(0.08));
}

// live suggestions + results list
const q = $('q');
const suggest = $('suggest');

function matches(item, query, feederOnly){
  const nq = norm(query);
  if (!nq) return false;
  const hay = feederOnly
    ? norm(item.feeder)
    : norm(item.title + ' ' + item.subtitle + ' ' + item.feeder + ' ' + item.type);
  return hay.includes(nq);
}

function renderSuggestions(items){
  if (!items.length){
    suggest.hidden = true;
    suggest.innerHTML = '';
    return;
  }
  suggest.hidden = false;
  suggest.innerHTML = items.map((it, i) => `
    <div class="item" data-i="${i}">
      <div><b>${escapeHtml(it.title)}</b></div>
      <small>${escapeHtml(it.subtitle)}</small>
    </div>
  `).join('');

  // click
  Array.from(suggest.querySelectorAll('.item')).forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-i'));
      const chosen = items[idx];
      chooseItem(chosen, true);
    });
  });
}

function renderResults(items, query){
  const box = $('results');
  if (!query){
    box.innerHTML = '';
    $('resultsMeta').textContent = 'Type to search…';
    return;
  }
  if (!items.length){
    box.innerHTML = '<div style="opacity:.8;padding:10px 2px">No results.</div>';
    $('resultsMeta').textContent = 'No matches';
    return;
  }
  $('resultsMeta').textContent = `${items.length} match(es)`;

  box.innerHTML = items.map((it, i) => `
    <div class="card" data-i="${i}">
      <div class="k">${escapeHtml(it.type)}</div>
      <div class="v">${escapeHtml(it.title)}</div>
      <div class="s">${escapeHtml(it.subtitle)}</div>
    </div>
  `).join('');

  Array.from(box.querySelectorAll('.card')).forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-i'));
      chooseItem(items[idx], true);
    });
  });
}

function chooseItem(item, openPopup){
  suggest.hidden = true;
  suggest.innerHTML = '';
  openSheet(false);
  if (!item) return;
  map.setView(item.latlng, Math.max(map.getZoom(), 16));
  if (openPopup && item.layerRef){
    try{ item.layerRef.openPopup(); } catch {}
  }
}

let lastSuggestions = [];
q.addEventListener('input', () => {
  const query = q.value.trim();
  const feederOnly = $('feederOnly').checked;

  if (!query){
    suggest.hidden = true;
    suggest.innerHTML = '';
    renderResults([], '');
    return;
  }

  // suggest: top 6
  lastSuggestions = searchItems
    .filter(it => matches(it, query, feederOnly))
    .slice(0, 6);

  renderSuggestions(lastSuggestions);
  renderResults(lastSuggestions, query);
});

q.addEventListener('focus', () => {
  if (lastSuggestions.length) renderSuggestions(lastSuggestions);
});

document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t.closest('.searchwrap')){ suggest.hidden = true; }
});

// --- GPS location (mobile)
let watchId = null;
let userMarker = null;
let accuracyCircle = null;

function startWatch(){
  if (!navigator.geolocation){
    alert('Geolocation is not supported on this device/browser.');
    return;
  }
  stopWatch();

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng = L.latLng(latitude, longitude);

      if (!userMarker){
        userMarker = L.circleMarker(latlng, { radius: 7, weight: 2, opacity: 0.95, fillOpacity: 0.9, color: '#fff', fillColor: '#4af' }).addTo(map);
        accuracyCircle = L.circle(latlng, { radius: Math.max(accuracy, 10), weight: 1, opacity: 0.25, fillOpacity: 0.08 }).addTo(map);
        map.setView(latlng, 17);
      } else {
        userMarker.setLatLng(latlng);
        accuracyCircle.setLatLng(latlng);
        accuracyCircle.setRadius(Math.max(accuracy, 10));
      }
    },
    (err) => {
      // Common on iOS/Safari if not HTTPS or permission denied
      const msg = err?.message || 'Unable to access location.';
      alert('Location error: ' + msg + '\n\nTip: location usually requires HTTPS (or localhost) and permission enabled.');
      stopWatch();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function stopWatch(){
  if (watchId !== null){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

$('btnLocate').addEventListener('click', () => {
  // toggle follow mode
  if (watchId === null) startWatch();
  else stopWatch();
});

// --- init
loadGeoJSON().catch(err => {
  console.error(err);
  alert('Failed to load GeoJSON. Run this app using a local web server (e.g., python -m http.server).');
});
