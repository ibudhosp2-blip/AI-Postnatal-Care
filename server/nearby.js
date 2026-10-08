'use strict';
// Nearby hospitals / Thai-traditional-medicine clinics from OpenStreetMap (Overpass API), cached.
// Merged on the client with the places staff added (staff-added places always win).
const OVERPASS = () => process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const cache = new Map();                     // key → { t, items }
const TTL = 24 * 3600e3;

function query(kind, lat, lng, r) {
  const a = `(around:${r},${lat},${lng})`;
  const body = kind === 'hospital'
    ? `nwr["amenity"="hospital"]${a};`
    : `nwr["name"~"แผนไทย|Thai Traditional"]["amenity"~"clinic|doctors|hospital|pharmacy"]${a};nwr["healthcare"]["name"~"แผนไทย|Thai Traditional"]${a};nwr["healthcare:speciality"~"traditional"]${a};`;
  return `[out:json][timeout:12];(${body});out center tags 60;`;
}

async function nearby(kind, lat, lng, radius = 15000) {
  if (!['hospital', 'ttm'].includes(kind)) throw new Error('kind');
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) throw new Error('coords');
  const key = `${kind}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}`;       // ~1 km grid: shared cache + less precise location leaves the server
  const hit = cache.get(key); if (hit && Date.now() - hit.t < TTL) return hit.items;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 14_000);
  try {
    const r = await fetch(OVERPASS(), { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query(kind, +lat.toFixed(4), +lng.toFixed(4), radius)) });
    if (!r.ok) throw new Error('overpass ' + r.status);
    const j = await r.json();
    const items = (j.elements || []).map(e => {
      const tg = e.tags || {}, name = tg['name:th'] || tg.name || tg['name:en'];
      const la = e.lat ?? (e.center && e.center.lat), lo = e.lon ?? (e.center && e.center.lon);
      if (!name || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
      return { kind, name: String(name).slice(0, 120), phone: String(tg.phone || tg['contact:phone'] || '').slice(0, 40), lat: Math.round(la * 1e6) / 1e6, lng: Math.round(lo * 1e6) / 1e6, source: 'osm' };
    }).filter(Boolean).slice(0, 60);
    cache.set(key, { t: Date.now(), items }); if (cache.size > 500) cache.delete(cache.keys().next().value);
    return items;
  } finally { clearTimeout(t); }
}
module.exports = { nearby, query };
