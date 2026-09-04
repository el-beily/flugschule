'use strict';
// Kleine Hilfsfunktionen – global als U
const U = {
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  todayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  dayKeyOffset(offset) { const d = new Date(); d.setDate(d.getDate() + offset); return this.todayKey(d); },
  dayDiff(aKey, bKey) { return Math.round((new Date(bKey + 'T00:00:00') - new Date(aKey + 'T00:00:00')) / 86400000); },
  hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); },
  b64(bytes) { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); },
  unb64(str) { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; },
  fmtTime(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); },
  fmtDate(ts) { return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); },
  pct(n, d) { return d ? Math.round(n / d * 100) : 0; },
  vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } },
  toast(msg, opts = {}) {
    const t = document.getElementById('toast');
    clearTimeout(t._timer);
    t.innerHTML = `<span>${msg}</span>` + (opts.action ? `<button type="button" class="toast-btn">${U.esc(opts.action)}</button>` : '');
    if (opts.action) t.querySelector('.toast-btn').onclick = () => { t.classList.remove('show'); opts.onAction && opts.onAction(); };
    t.className = 'show' + (opts.kind ? ' kind-' + opts.kind : '');
    t._timer = setTimeout(() => t.classList.remove('show'), opts.duration || 2600);
  },
  confetti(duration = 2600, count = 160) {
    const c = document.getElementById('confetti');
    const ctx = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight; c.style.display = 'block';
    const colors = ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ffffff', '#ff9f1c', '#8ecae6'];
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.4, r: 5 + Math.random() * 7,
      c: colors[Math.floor(Math.random() * colors.length)], vx: (Math.random() - 0.5) * 3, vy: 2.5 + Math.random() * 4,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3
    }));
    const start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore();
      }
      if (t - start < duration) requestAnimationFrame(frame); else { ctx.clearRect(0, 0, c.width, c.height); c.style.display = 'none'; }
    })(start);
  },
  download(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
  async copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } },
  ring(pct, size = 96, stroke = 10, cls = '') {
    const r = (size - stroke) / 2, circ = 2 * Math.PI * r, off = circ * (1 - Math.min(1, Math.max(0, pct / 100)));
    return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg>`;
  }
};
