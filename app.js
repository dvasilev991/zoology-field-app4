const STORAGE_KEY = 'turilik_field_records_v4';
const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const detectionSet = new Set();
let records = [];
let currentId = '';
let coverPoints = Array(100).fill('');
let activeArm = 'N';

const arms = [
  { key: 'N', label: 'N — северен лъч', start: 0, end: 25 },
  { key: 'S', label: 'S — южен лъч', start: 25, end: 50 },
  { key: 'W', label: 'W — западен лъч', start: 50, end: 75 },
  { key: 'E', label: 'E — източен лъч', start: 75, end: 100 }
];

const coverCategories = [
  { key: 'herbaceous', label: 'Тревиста растителност', short: 'ТР', cls: 'cat-herbaceous', color: '#22c55e' },
  { key: 'bareSoil', label: 'Гола почва', short: 'ГП', cls: 'cat-bareSoil', color: '#a16207' },
  { key: 'gravelSmallStones', label: 'Чакъл / дребни камъни', short: 'ДК', cls: 'cat-gravelSmallStones', color: '#94a3b8' },
  { key: 'largeStones', label: 'Едри камъни', short: 'ЕК', cls: 'cat-largeStones', color: '#64748b' },
  { key: 'exposedRock', label: 'Гола скала', short: 'СК', cls: 'cat-exposedRock', color: '#334155' },
  { key: 'juniper', label: 'Хвойна', short: 'ХВ', cls: 'cat-juniper', color: '#15803d' },
  { key: 'otherShrubs', label: 'Други храсти', short: 'ДХ', cls: 'cat-otherShrubs', color: '#65a30d' },
  { key: 'litterMossLichen', label: 'Постилка / мъх / лишеи', short: 'ПМ', cls: 'cat-litterMossLichen', color: '#84cc16' },
  { key: 'anthropogenic', label: 'Антропогенен субстрат', short: 'АН', cls: 'cat-anthropogenic', color: '#ef4444' }
];
const coverByKey = Object.fromEntries(coverCategories.map(c => [c.key, c]));

function newId() { return 'TUR-' + new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14); }
function today() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function avg(arr) { const a = arr.map(n).filter(x => Number.isFinite(x)); if (!a.length) return ''; return (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1); }
function pct(count, total) { const t = Math.max(n(total), 1); return ((n(count) / t) * 100).toFixed(1); }
function csvEscape(v) { const s = String(v ?? ''); return '"' + s.replace(/"/g, '""') + '"'; }
function xmlEscape(v) { return String(v ?? '').replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch])); }
function aspectClass(deg) { const d = Number(deg); if (!Number.isFinite(d)) return ''; const x = ((d % 360) + 360) % 360; if (x >= 337.5 || x < 22.5) return 'N'; if (x < 67.5) return 'NE'; if (x < 112.5) return 'E'; if (x < 157.5) return 'SE'; if (x < 202.5) return 'S'; if (x < 247.5) return 'SW'; if (x < 292.5) return 'W'; return 'NW'; }
function setStatus(msg) { statusEl.textContent = msg; }
function normaliseCoverPoints(points) {
  const arr = Array.isArray(points) ? points.slice(0, 100) : [];
  while (arr.length < 100) arr.push('');
  return arr.map(x => coverByKey[x] ? x : '');
}
function filledPoints() { return coverPoints.filter(Boolean).length; }
function armByKey(key) { return arms.find(a => a.key === key) || arms[0]; }
function armProgress(arm) { return coverPoints.slice(arm.start, arm.end).filter(Boolean).length; }
function firstEmptyIndexInArm(arm) {
  for (let i = arm.start; i < arm.end; i++) if (!coverPoints[i]) return i;
  return -1;
}
function setActiveArm(key) {
  activeArm = key;
  renderTransectButtons();
  updateCoverProgress();
}
function advanceArmIfNeeded() {
  const current = armByKey(activeArm);
  if (firstEmptyIndexInArm(current) !== -1) return;
  const next = arms.find(a => firstEmptyIndexInArm(a) !== -1);
  if (next) activeArm = next.key;
}

const defaults = {
  id: newId(), observer: '', date: today(), time: nowTime(), locality: '', plotType: 'occupied', habitatStratum: 'open_stony_steppe',
  latitude: '', longitude: '', elevation: '', gpsAccuracy: '', coordinateNote: '',
  breedingEvidence: 'probable_territory', firstDetectionMethod: 'passive_listening', numberOfBirds: '', numberOfVisits: '', playbackUsed: 'no', thermalUsed: 'yes_night', confidence: 'probable', behaviour: '',
  slope1: '', slope2: '', slope3: '', aspectDeg: '', aspectClass: '', totalPoints: '100', herbaceous: '', bareSoil: '', gravelSmallStones: '', largeStones: '', exposedRock: '', juniper: '', otherShrubs: '', litterMossLichen: '', anthropogenic: '', coverPoints: [],
  meanHerbHeight: '', maxHerbHeight: '', juniperClumps: '', juniperPattern: 'isolated', meanJuniperHeight: '', maxJuniperHeight: '', nearestJuniperDistance: '', visibilityN: '', visibilityNE: '', visibilityE: '', visibilitySE: '', visibilityS: '', visibilitySW: '', visibilityW: '', visibilityNW: '',
  grazingIndex: '', disturbanceIndex: '', distanceToRoad: '', distanceToSettlement: '', disturbanceNotes: '', notes: ''
};

function derive(r) {
  const total = n(r.totalPoints) || 100;
  const open = n(r.bareSoil) + n(r.gravelSmallStones) + n(r.largeStones) + n(r.exposedRock);
  const stony = n(r.gravelSmallStones) + n(r.largeStones) + n(r.exposedRock);
  const shrubs = n(r.juniper) + n(r.otherShrubs);
  const visibility = ['visibilityN', 'visibilityNE', 'visibilityE', 'visibilitySE', 'visibilityS', 'visibilitySW', 'visibilityW', 'visibilityNW'].map(k => r[k]).filter(v => String(v).trim() !== '');
  const meanVisibility = visibility.length ? avg(visibility) : '';
  const cp = normaliseCoverPoints(r.coverPoints);
  return {
    meanSlope: avg([r.slope1, r.slope2, r.slope3]),
    aspectClass: r.aspectClass || aspectClass(r.aspectDeg),
    enteredCoverPoints: cp.filter(Boolean).length,
    herbaceousPct: pct(r.herbaceous, total),
    openSubstratePct: pct(open, total),
    stonySubstratePct: pct(stony, total),
    juniperPct: pct(r.juniper, total),
    shrubCoverPct: pct(shrubs, total),
    meanVisibility,
    visualObstruction: meanVisibility === '' ? '' : (100 - Number(meanVisibility)).toFixed(1),
    transectN: cp.slice(0, 25).join(';'),
    transectS: cp.slice(25, 50).join(';'),
    transectW: cp.slice(50, 75).join(';'),
    transectE: cp.slice(75, 100).join(';')
  };
}

function getFormData() {
  const fd = new FormData(form);
  const obj = { ...defaults };
  for (const [k, v] of fd.entries()) obj[k] = v;
  obj.id = document.getElementById('id').value || currentId || newId();
  obj.totalPoints = '100';
  obj.detectionBasis = Array.from(detectionSet);
  obj.coverPoints = normaliseCoverPoints(coverPoints);
  obj.updatedAt = new Date().toISOString();
  obj.derived = derive(obj);
  return obj;
}

function setFormData(obj) {
  const r = { ...defaults, ...obj };
  currentId = r.id;
  detectionSet.clear();
  (r.detectionBasis || []).forEach(x => detectionSet.add(x));
  coverPoints = normaliseCoverPoints(r.coverPoints);
  activeArm = 'N';
  for (const [k, v] of Object.entries(r)) {
    if (form.elements[k] && k !== 'coverPoints') form.elements[k].value = v ?? '';
  }
  document.getElementById('id').value = r.id;
  form.elements.totalPoints.value = '100';
  document.querySelectorAll('#detectionPills .pill').forEach(btn => btn.classList.toggle('on', detectionSet.has(btn.dataset.method)));
  syncCountsFromCoverPoints();
  renderAllCoverUI();
  updateSummaries();
}

function metric(value, text) { return `<div class="metric"><b>${xmlEscape(value)}</b><span>${xmlEscape(text)}</span></div>`; }
function updateSummaries() {
  const r = getFormData();
  const d = r.derived;
  const coverSummary = document.getElementById('coverSummary');
  if (coverSummary) coverSummary.innerHTML = metric(`${d.meanSlope || '—'}°`, 'среден наклон') + metric(`${d.herbaceousPct}%`, 'тревно') + metric(`${d.openSubstratePct}%`, 'открит субстрат') + metric(`${d.stonySubstratePct}%`, 'каменисто') + metric(`${d.juniperPct}%`, 'хвойна') + metric(`${d.shrubCoverPct}%`, 'храсти') + metric(`${d.enteredCoverPoints}/100`, 'въведени точки');
  const visibilitySummary = document.getElementById('visibilitySummary');
  if (visibilitySummary) visibilitySummary.innerHTML = metric(`${d.meanVisibility || '—'}%`, 'средна видимост') + metric(`${d.visualObstruction || '—'}%`, 'закритост') + metric(`${r.juniperClumps || '—'}`, 'хвойнови групи') + metric(`${r.grazingIndex || '—'}`, 'паша');
  renderCoverProgressOnly();
}

function loadLocal() { try { records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { records = []; } renderRecords(); }
function saveLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
function saveRecord() {
  syncCountsFromCoverPoints();
  const r = getFormData();
  const exists = records.some(x => x.id === r.id);
  records = exists ? records.map(x => x.id === r.id ? r : x) : [r, ...records];
  saveLocal(); renderRecords(); setStatus(`Записът ${r.id} е запазен.`);
}
function renderRecords() {
  const box = document.getElementById('records');
  const q = (document.getElementById('search')?.value || '').toLowerCase();
  const list = records.filter(r => `${r.id} ${r.locality} ${r.observer} ${r.date}`.toLowerCase().includes(q));
  box.innerHTML = list.length ? list.map(r => `<div class="record"><div class="id">${xmlEscape(r.id)}</div><div class="meta">${xmlEscape(r.date)} · ${xmlEscape(r.locality || 'без локация')}</div><div class="meta">${xmlEscape((r.coverPoints || []).filter(Boolean).length)} точки по трансектите</div><div class="row" style="margin-top:7px"><button class="small ghost" onclick="loadRecord('${r.id}')">Отвори</button><button class="small danger" onclick="deleteRecord('${r.id}')">Изтрий</button></div></div>`).join('') : '<div class="status">Няма записи.</div>';
}
window.loadRecord = (id) => { const r = records.find(x => x.id === id); if (r) { setFormData(r); setStatus(`Отворен е запис ${id}.`); } };
window.deleteRecord = (id) => { if (!confirm('Да изтрия ли този запис?')) return; records = records.filter(x => x.id !== id); saveLocal(); renderRecords(); if (currentId === id) newRecord(); };
function newRecord() { currentId = newId(); detectionSet.clear(); coverPoints = Array(100).fill(''); activeArm = 'N'; setFormData({ ...defaults, id: currentId, date: today(), time: nowTime(), coverPoints }); setStatus('Създаден е нов празен запис.'); }

function download(name, type, text) { if (window.AndroidBridge && typeof window.AndroidBridge.saveText === 'function') { window.AndroidBridge.saveText(name, type, text); setStatus('Файлът се записва чрез Android приложението: ' + name); return; } const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function exportJSON() { download(`turilik_records_${today()}.json`, 'application/json', JSON.stringify(records, null, 2)); }
function exportCSV() {
  const cols = ['id', 'date', 'time', 'observer', 'locality', 'plotType', 'habitatStratum', 'latitude', 'longitude', 'elevation', 'gpsAccuracy', 'breedingEvidence', 'detectionBasis', 'numberOfBirds', 'numberOfVisits', 'firstDetectionMethod', 'playbackUsed', 'thermalUsed', 'confidence', 'slope1', 'slope2', 'slope3', 'meanSlope', 'aspectDeg', 'aspectClass', 'totalPoints', 'enteredCoverPoints', 'transectN', 'transectS', 'transectW', 'transectE', 'coverPointsSequence', 'herbaceous', 'herbaceousPct', 'bareSoil', 'gravelSmallStones', 'largeStones', 'exposedRock', 'openSubstratePct', 'stonySubstratePct', 'juniper', 'juniperPct', 'otherShrubs', 'shrubCoverPct', 'meanHerbHeight', 'maxHerbHeight', 'juniperClumps', 'meanJuniperHeight', 'maxJuniperHeight', 'nearestJuniperDistance', 'juniperPattern', 'meanVisibility', 'visualObstruction', 'grazingIndex', 'disturbanceIndex', 'distanceToRoad', 'distanceToSettlement', 'behaviour', 'notes', 'disturbanceNotes'];
  const rows = records.map(r => { const d = derive(r); const m = { ...r, ...d, detectionBasis: (r.detectionBasis || []).join(';'), coverPointsSequence: normaliseCoverPoints(r.coverPoints).join(';') }; return cols.map(c => csvEscape(m[c])).join(','); });
  download(`turilik_records_${today()}.csv`, 'text/csv;charset=utf-8', [cols.join(','), ...rows].join('\n'));
}
function validCoord(r) { return Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)); }
function exportGeoJSON() {
  const features = records.filter(validCoord).map(r => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(r.longitude), Number(r.latitude), r.elevation === '' ? undefined : Number(r.elevation)].filter(v => v !== undefined) },
    properties: { ...r, coverPoints: normaliseCoverPoints(r.coverPoints).join(';'), detectionBasis: (r.detectionBasis || []).join(';') }
  }));
  download(`turilik_coordinates_${today()}.geojson`, 'application/geo+json', JSON.stringify({ type: 'FeatureCollection', features }, null, 2));
}
function exportKML() {
  const placemarks = records.filter(validCoord).map(r => `<Placemark><name>${xmlEscape(r.id)}</name><description>${xmlEscape([r.date, r.locality, r.plotType, r.breedingEvidence].filter(Boolean).join(' | '))}</description><Point><coordinates>${Number(r.longitude)},${Number(r.latitude)},${r.elevation ? Number(r.elevation) : 0}</coordinates></Point></Placemark>`).join('\n');
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Turilik field records</name>${placemarks}</Document></kml>`;
  download(`turilik_coordinates_${today()}.kml`, 'application/vnd.google-earth.kml+xml', kml);
}
async function copyCoords() {
  const lat = form.elements.latitude.value, lon = form.elements.longitude.value;
  if (!lat || !lon) { setStatus('Няма въведени координати за копиране.'); return; }
  const text = `${lat}, ${lon}`;
  try { await navigator.clipboard.writeText(text); setStatus(`Координатите са копирани: ${text}`); }
  catch { setStatus(`Координати: ${text}`); }
}
function applyLocation(lat, lon, alt, acc) {
  if (lat == null || lon == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    setStatus('Получена е невалидна GPS позиция. Пробвай отново на открито.');
    return;
  }
  form.elements.latitude.value = Number(lat).toFixed(6);
  form.elements.longitude.value = Number(lon).toFixed(6);
  if (alt != null && Number.isFinite(Number(alt))) form.elements.elevation.value = Number(alt).toFixed(1);
  if (acc != null && Number.isFinite(Number(acc))) form.elements.gpsAccuracy.value = Number(acc).toFixed(1);
  updateSummaries();
  setStatus(`GPS координатите са добавени. Точност: ${acc ? Number(acc).toFixed(1) + ' m' : 'няма данни'}.`);
}
window.receiveNativeLocation = function(payload) {
  try {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (data && data.error) { setStatus(data.error); return; }
    applyLocation(data.latitude, data.longitude, data.altitude, data.accuracy);
  } catch { setStatus('Неуспешно прочитане на GPS позиция от Android приложението.'); }
};
function useGPS() {
  if (window.AndroidBridge && typeof window.AndroidBridge.requestLocation === 'function') {
    setStatus('Изчакване на GPS позиция от Android устройството...');
    window.AndroidBridge.requestLocation();
    return;
  }
  if (!window.isSecureContext) { setStatus('GPS изисква HTTPS, инсталирана PWA или Android APK версия. Отвори GitHub Pages адреса, не локален файл.'); return; }
  if (!navigator.geolocation) { setStatus('Браузърът не поддържа GPS.'); return; }
  setStatus('Изчакване на GPS позиция с висока точност...');
  navigator.geolocation.getCurrentPosition(pos => {
    applyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude, pos.coords.accuracy);
  }, err => {
    const msg = err.code === 1 ? 'Достъпът до локация е отказан. Разреши Location за Chrome/приложението.' : err.code === 2 ? 'Позицията не може да бъде определена. Излез на открито и пробвай пак.' : 'Времето за GPS изтече. Пробвай отново на открито.';
    setStatus(msg);
  }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
}

function syncCountsFromCoverPoints() {
  const counts = Object.fromEntries(coverCategories.map(c => [c.key, 0]));
  normaliseCoverPoints(coverPoints).forEach(k => { if (k && counts[k] !== undefined) counts[k] += 1; });
  coverCategories.forEach(c => { if (form.elements[c.key]) form.elements[c.key].value = counts[c.key] || ''; });
  form.elements.totalPoints.value = '100';
}
function addCoverPoint(cat) {
  let arm = armByKey(activeArm);
  let idx = firstEmptyIndexInArm(arm);
  if (idx === -1) {
    const next = arms.find(a => firstEmptyIndexInArm(a) !== -1);
    if (!next) { setStatus('Вече са въведени всички 100 точки по трансектите.'); return; }
    activeArm = next.key; arm = next; idx = firstEmptyIndexInArm(arm);
  }
  coverPoints[idx] = cat;
  syncCountsFromCoverPoints();
  advanceArmIfNeeded();
  renderAllCoverUI();
  updateSummaries();
  setStatus(`Въведена е точка ${idx - arm.start + 1} от лъч ${arm.key}: ${coverByKey[cat].label}.`);
}
function undoCoverPoint() {
  const arm = armByKey(activeArm);
  for (let i = arm.end - 1; i >= arm.start; i--) {
    if (coverPoints[i]) { coverPoints[i] = ''; syncCountsFromCoverPoints(); renderAllCoverUI(); updateSummaries(); setStatus(`Премахната е последната точка от лъч ${arm.key}.`); return; }
  }
  for (let i = coverPoints.length - 1; i >= 0; i--) {
    if (coverPoints[i]) { coverPoints[i] = ''; syncCountsFromCoverPoints(); renderAllCoverUI(); updateSummaries(); setStatus('Премахната е последната въведена точка.'); return; }
  }
}
function clearCoverPoints() {
  if (!filledPoints() || confirm('Да изчистя ли всички въведени точки за покривка?')) {
    coverPoints = Array(100).fill(''); activeArm = 'N'; syncCountsFromCoverPoints(); renderAllCoverUI(); updateSummaries(); setStatus('Точките за покривка са изчистени.');
  }
}
function renderCoverProgressOnly() {
  const done = filledPoints();
  const pctDone = Math.min(100, done);
  const t = document.getElementById('coverProgressText');
  const b = document.getElementById('coverProgressBar');
  const a = document.getElementById('activeTransectText');
  if (t) t.textContent = `${done} / 100`;
  if (b) b.style.width = pctDone + '%';
  if (a) a.textContent = `Активен лъч: ${activeArm} (${armProgress(armByKey(activeArm))}/25)`;
}
function renderTransectButtons() {
  const box = document.getElementById('transectButtons');
  if (!box) return;
  box.innerHTML = arms.map(a => `<button type="button" class="transect-btn ${a.key === activeArm ? 'active' : ''}" data-arm="${a.key}">${a.key}<br><span class="meta">${armProgress(a)}/25</span></button>`).join('');
  box.querySelectorAll('[data-arm]').forEach(btn => btn.onclick = () => setActiveArm(btn.dataset.arm));
}
function renderCoverPointGrid() {
  const grid = document.getElementById('coverPointGrid');
  if (!grid) return;
  grid.innerHTML = arms.map(a => {
    const cells = coverPoints.slice(a.start, a.end).map((key, j) => {
      const cat = coverByKey[key];
      const pointNo = j + 1;
      const content = cat ? `<span class="ptno">${pointNo}</span><span class="ptcat">${cat.short}</span>` : `<span class="ptno">${pointNo}</span><span class="ptcat">—</span>`;
      return `<div class="pointcell ${cat ? cat.cls : 'empty'}" data-index="${a.start + j}" title="${a.key}${pointNo}: ${cat ? cat.label : 'празно'}">${content}</div>`;
    }).join('');
    return `<div class="transect-card"><div class="transect-title"><span>${a.label}</span><span>${armProgress(a)}/25</span></div><div class="transect-cells">${cells}</div></div>`;
  }).join('');
  grid.querySelectorAll('[data-index]').forEach(cell => cell.onclick = () => {
    const idx = Number(cell.dataset.index);
    const arm = arms.find(a => idx >= a.start && idx < a.end);
    if (arm) activeArm = arm.key;
    if (coverPoints[idx] && confirm(`Да изтрия ли точка ${arm.key}${idx - arm.start + 1}?`)) coverPoints[idx] = '';
    syncCountsFromCoverPoints(); renderAllCoverUI(); updateSummaries();
  });
}
function renderCoverCategories() {
  const box = document.getElementById('coverCategoryButtons');
  if (box) {
    box.innerHTML = coverCategories.map(c => `<button type="button" class="catbtn" data-covercat="${c.key}"><span class="${c.cls}"></span>${c.short} — ${c.label}</button>`).join('');
    box.querySelectorAll('[data-covercat]').forEach(btn => btn.onclick = () => addCoverPoint(btn.dataset.covercat));
  }
  const legend = document.getElementById('coverLegend');
  if (legend) {
    legend.innerHTML = coverCategories.map(c => `<div class="legend-item"><span class="legend-dot ${c.cls}"></span><b>${c.short}</b> ${c.label}</div>`).join('');
  }
}
function renderCoverStats() {
  const box = document.getElementById('coverStatsTable');
  const status = document.getElementById('coverStatsStatus');
  if (!box) return;
  const total = 100;
  const counts = Object.fromEntries(coverCategories.map(c => [c.key, 0]));
  normaliseCoverPoints(coverPoints).forEach(k => { if (k && counts[k] !== undefined) counts[k] += 1; });
  const done = Object.values(counts).reduce((s, x) => s + x, 0);
  const rows = coverCategories.map(c => `<tr><td><span class="legend-dot ${c.cls}"></span> <b>${c.short}</b> — ${c.label}</td><td>${counts[c.key]}</td><td>${pct(counts[c.key], total)}%</td></tr>`).join('');
  const open = counts.bareSoil + counts.gravelSmallStones + counts.largeStones + counts.exposedRock;
  const stony = counts.gravelSmallStones + counts.largeStones + counts.exposedRock;
  const shrubs = counts.juniper + counts.otherShrubs;
  box.innerHTML = `<table class="stats-table"><thead><tr><th>Категория</th><th>Брой</th><th>% от 100</th></tr></thead><tbody>${rows}<tr><th>Открит субстрат: гола почва + камъни + скала</th><th>${open}</th><th>${pct(open, total)}%</th></tr><tr><th>Каменист субстрат: чакъл + едри камъни + скала</th><th>${stony}</th><th>${pct(stony, total)}%</th></tr><tr><th>Храстово покритие: хвойна + други храсти</th><th>${shrubs}</th><th>${pct(shrubs, total)}%</th></tr></tbody></table>`;
  if (status) status.innerHTML = done === 100 ? `<span class="oktext">Попълнени са всички 100 точки. Процентите са готови за използване в анализа.</span>` : `<span class="warn">Попълнени са ${done}/100 точки. Процентите са временни и ще станат окончателни след попълване на всички точки.</span>`;
}
function renderAllCoverUI() { renderTransectButtons(); renderCoverPointGrid(); renderCoverProgressOnly(); renderCoverStats(); }

form.addEventListener('input', () => {
  if (form.elements.aspectDeg && document.activeElement === form.elements.aspectDeg) form.elements.aspectClass.value = aspectClass(form.elements.aspectDeg.value);
  if (document.activeElement && document.activeElement.name === 'totalPoints') form.elements.totalPoints.value = '100';
  updateSummaries();
});

document.getElementById('saveBtn').onclick = saveRecord;
document.getElementById('resetBtn').onclick = newRecord;
document.getElementById('newBtn').onclick = newRecord;
document.getElementById('gpsBtn').onclick = useGPS;
document.getElementById('copyCoordsBtn').onclick = copyCoords;
document.getElementById('csvBtn').onclick = exportCSV;
document.getElementById('jsonBtn').onclick = exportJSON;
document.getElementById('geojsonBtn').onclick = exportGeoJSON;
document.getElementById('kmlBtn').onclick = exportKML;
document.getElementById('search').oninput = renderRecords;
document.getElementById('undoPointBtn').onclick = undoCoverPoint;
document.getElementById('clearPointsBtn').onclick = clearCoverPoints;

document.getElementById('importFile').onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { try { const data = JSON.parse(reader.result); if (!Array.isArray(data)) throw 0; records = data; saveLocal(); renderRecords(); setStatus(`Импортирани са ${records.length} записа.`); } catch { setStatus('Невалиден JSON файл.'); } };
  reader.readAsText(file);
};
document.querySelectorAll('#detectionPills .pill').forEach(btn => btn.onclick = () => { const m = btn.dataset.method; if (detectionSet.has(m)) { detectionSet.delete(m); btn.classList.remove('on'); } else { detectionSet.add(m); btn.classList.add('on'); } });
document.querySelectorAll('.tab').forEach(btn => btn.onclick = () => { document.querySelectorAll('.tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); document.querySelectorAll('.tabpane').forEach(p => p.classList.add('hidden')); document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); });

if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {})); }
renderCoverCategories();
loadLocal();
newRecord();
