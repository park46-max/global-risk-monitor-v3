// 3D globe layer (globe.gl). app.js decides when to start it and handles every fallback.
(() => {
'use strict';
const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let g, sel = null, hov = null, byId = {}, C = {};
const keyOf = d => byId[d.id] || null;
const cap = d => { const k = keyOf(d); return k ? rgba(C[k].color, k === sel ? .9 : d === hov ? .75 : .5) : d === hov ? '#2a4066' : '#14213a'; };
const side = d => { const k = keyOf(d); return k && (k === sel || d === hov) ? rgba(C[k].color, .6) : 'rgba(20,33,58,.7)'; };
const alt = d => { const k = keyOf(d); return k ? (k === sel ? .035 : d === hov ? .028 : .012) : d === hov ? .012 : .004; };
const tip = d => { const k = keyOf(d);
  return `<div class="gtip"><b>${esc(k ? C[k].name : d.properties.name)}</b>${k ? (k === 'TWN' ? 'Political status disputed. ' : '') + 'Click to select' : 'Click to fly here'}</div>`; };
const refresh = () => g.polygonCapColor(d => cap(d)).polygonSideColor(d => side(d)).polygonAltitude(d => alt(d));
const fly = v => g.pointOfView({ lat: v.lat, lng: v.lng, altitude: v.alt }, reduce ? 0 : 1100);

window.GRM_GLOBE = {
  init(el, feats, o) {
    C = o.C; byId = Object.fromEntries(Object.keys(C).map(k => [C[k].map, k]));
    g = Globe()(el).backgroundColor('rgba(0,0,0,0)').showAtmosphere(true).atmosphereColor('#22d3ee').atmosphereAltitude(0.12)
      .polygonsData(feats).polygonStrokeColor(() => 'rgba(140,170,215,.6)').polygonsTransitionDuration(reduce ? 0 : 250).polygonLabel(tip)
      .onPolygonHover(d => { hov = d || null; el.style.cursor = d ? 'pointer' : 'grab'; refresh(); })
      .onPolygonClick(d => { if (d) keyOf(d) ? o.onSelect(keyOf(d)) : o.onOther(d); })
      .labelsData(Object.keys(C)).labelLat(k => C[k].label.ll[1]).labelLng(k => C[k].label.ll[0]).labelText(k => C[k].name)
      .labelSize(1.1).labelDotRadius(0.3).labelColor(k => C[k].color).labelResolution(2).labelAltitude(0.04);
    refresh();
    try { const m = g.globeMaterial(); m.color.set('#0b1a33'); m.emissive.set('#06101f'); m.shininess = 8; } catch (e) {}
    const size = () => g.width(el.clientWidth).height(el.clientHeight);
    size(); new ResizeObserver(size).observe(el);
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 2));
    const c = g.controls(); c.autoRotate = !reduce; c.autoRotateSpeed = .5; c.enableDamping = true; c.minDistance = 125; c.maxDistance = 450; c.zoomSpeed = .7;
    c.addEventListener('start', () => { c.autoRotate = false; if (o.onUserRotate) o.onUserRotate(); });
    g.pointOfView({ lat: 20, lng: 50, altitude: 2.4 }, 0);
    let inView = true; const gate = () => (document.hidden || !inView) ? g.pauseAnimation() : g.resumeAnimation();   // no rendering while hidden
    new IntersectionObserver(e => { inView = e[0].isIntersecting; gate(); }).observe(el);
    document.addEventListener('visibilitychange', gate);
  },
  select(k, doFly) { sel = k; refresh(); if (doFly) { g.controls().autoRotate = false; fly(C[k].view); } },
  flyTo(v, feature) { hov = feature || null; refresh(); g.controls().autoRotate = false; fly(v); },
  reset() { fly({ lat: 20, lng: 50, alt: 2.4 }); },
  rotate(on) { g.controls().autoRotate = on && !reduce; }
};
})();
