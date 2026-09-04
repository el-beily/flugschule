'use strict';
// Haupt-App: Screens, Navigation, Session-Ablauf
const App = {
  version: '0.1.0',
  bank: null, key: null, profile: null, p: null, session: null, lastSession: null,
  screen: 'boot', args: {}, timer: null, payload: null,
  el: null,

  async init() {
    this.el = document.getElementById('app');
    this.el.addEventListener('click', e => this.onClick(e));
    this.el.addEventListener('submit', e => this.onSubmit(e));
    this.el.addEventListener('change', e => this.onChange(e));
    window.addEventListener('popstate', e => this.onPop(e));
    document.addEventListener('keydown', e => this.onKey(e));
    this.registerSW();
    if (!FSCrypto.available()) { this.show('error', { msg: 'Dein Browser unterstützt die nötige Verschlüsselung nicht (oder die Seite läuft nicht über HTTPS).' }, { replace: true }); return; }
    const stored = Store.get('key');
    if (stored) {
      this.show('loading', {}, { replace: true });
      try {
        this.key = await FSCrypto.importKey(stored);
        this.bank = await FSCrypto.decrypt(await this.fetchPayload(), this.key);
        this.afterUnlock(); return;
      } catch (e) { Store.del('key'); }
    }
    this.show('lock', {}, { replace: true });
  },

  async fetchPayload() {
    if (this.payload) return this.payload;
    const res = await fetch('data/questions.enc.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Fragen konnten nicht geladen werden (' + res.status + ')');
    this.payload = await res.json();
    return this.payload;
  },

  registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) U.toast('Update verfügbar', { action: 'Neu laden', onAction: () => location.reload(), duration: 8000 });
        });
      });
    }).catch(() => { /* offline-Modus optional */ });
  },

  // ---------- Navigation ----------
  mainScreens: ['home', 'topics', 'exam', 'stats', 'profile'],
  show(screen, args = {}, opts = {}) {
    if (this.screen === 'quiz' && screen !== 'quiz') this.stopTimer();
    this.screen = screen; this.args = args;
    try { if (opts.replace) history.replaceState({ screen, args }, ''); else history.pushState({ screen, args }, ''); } catch (e) { /* ignore */ }
    this.render();
  },
  onPop(e) {
    const st = e.state || { screen: 'home' };
    if (!this.bank) { this.screen = 'lock'; this.render(); return; }
    if (!this.profile) { this.screen = 'login'; this.render(); return; }
    if (st.screen === 'quiz' && !(this.session && !this.session.finished)) { this.screen = 'home'; this.args = {}; this.render(); return; }
    if (['lock', 'login', 'loading'].includes(st.screen)) { this.screen = 'home'; this.args = {}; this.render(); return; }
    this.screen = st.screen; this.args = st.args || {}; this.render();
  },
  render() {
    const view = this.views[this.screen] || this.views.home;
    let html = view.call(this, this.args);
    if (this.mainScreens.includes(this.screen)) html += this.nav();
    this.el.innerHTML = html;
    this.el.className = 'screen-' + this.screen;
    window.scrollTo(0, 0);
    const focus = this.el.querySelector('[autofocus]');
    if (focus) setTimeout(() => focus.focus(), 50);
    if (this.screen === 'quiz') this.startTimer();
  },
  nav() {
    const items = [['home', '🏠', 'Start'], ['topics', '📚', 'Themen'], ['exam', '📝', 'Prüfung'], ['stats', '📈', 'Fortschritt'], ['profile', '👤', 'Profil']];
    return `<nav class="bottomnav">${items.map(([s, i, l]) => `<button type="button" class="${s === this.screen ? 'active' : ''}" data-action="nav" data-screen="${s}"><span class="ic">${i}</span><span>${l}</span></button>`).join('')}</nav>`;
  },

  // ---------- Profile ----------
  afterUnlock() {
    const cur = Store.get('current');
    const prof = Store.profiles().find(p => p.id === cur);
    if (prof) this.login(prof, true); else this.show('login', {}, { replace: true });
  },
  login(profile, replace) {
    this.profile = profile;
    this.p = Store.loadProgress(profile.id);
    Store.set('current', profile.id);
    this.show('home', {}, { replace: !!replace });
  },
  save() { if (this.profile && this.p) Store.saveProgress(this.profile.id, this.p); },
  topicName(id) { const t = this.bank.topics.find(t => t.id === id); return t ? t.name : (id === 'all' ? 'Alle Themen' : id); },
  topicIcon(id) { const t = this.bank.topics.find(t => t.id === id); return t?.icon || '📘'; },
  examMeta() { return Object.assign({ questions: 20, minutes: 30, passPercent: 75 }, this.bank.meta?.exam || {}); },

  // ---------- Session ----------
  start(mode, topic, n, opts = {}) {
    let qs;
    if (mode === 'exam') qs = Quiz.pickExam(this.bank, this.p, topic, n);
    else if (mode === 'review') qs = Quiz.pickReview(this.bank, this.p, topic, n);
    else qs = Quiz.pickLearn(this.bank, this.p, topic, n);
    if (!qs.length) { U.toast('Keine passenden Fragen gefunden.'); return; }
    this.session = Quiz.create(mode, qs, { topic, limitSec: opts.limitSec || 0, passPercent: this.examMeta().passPercent });
    this.show('quiz');
  },
  startFromQuestions(mode, questions) {
    if (!questions.length) return;
    this.session = Quiz.create(mode, U.shuffle(questions), { topic: 'all' });
    this.show('quiz');
  },
  current() { return this.session.items[this.session.i]; },
  commit(item, quiet) {
    const s = this.session, p = this.p;
    item.correct = Quiz.grade(item.q, item.picked);
    item.done = true;
    const before = Game.levelFor(p.xp).level;
    if (item.correct) { s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo); } else s.combo = 0;
    const goalBefore = Game.today(p).answered >= p.settings.dailyGoal;
    const xp = Game.recordAnswer(p, item.q, item.correct, { combo: s.combo, mode: s.mode });
    item.xp = xp; s.xp += xp;
    const after = Game.levelFor(p.xp).level;
    if (after > before) { s.levelUps++; if (!quiet) this.onLevelUp(after); }
    const dailyNow = Game.today(p).answered >= p.settings.dailyGoal;
    if (dailyNow && !goalBefore && !quiet) { U.toast('🎯 Tagesziel erreicht!', { kind: 'ok' }); }
    const ctx = { combo: s.combo, hour: new Date().getHours(), dailyDone: dailyNow, topicMastered: Game.topicMastery(p, this.bank, item.q.topic).pct === 100, allRight: Game.allRight(p, this.bank) };
    const fresh = Game.checkBadges(p, ctx);
    fresh.forEach(b => { s.badges.push(b.id); if (!quiet) setTimeout(() => U.toast(`${b.icon} Neues Abzeichen: <b>${U.esc(b.name)}</b>`, { kind: 'badge', duration: 3500 }), 400); });
    if (!quiet) { this.save(); U.vibrate(item.correct ? 30 : [60, 40, 60]); }
  },
  onLevelUp(level) {
    const rank = Game.rankFor(level);
    setTimeout(() => { U.toast(`⬆️ Level ${level} – ${rank.icon} ${U.esc(rank.name)}`, { kind: 'ok', duration: 3500 }); U.confetti(1800, 80); }, 300);
  },
  next() {
    const s = this.session;
    if (s.i + 1 >= s.items.length) this.finish(); else { s.i++; this.render(); }
  },
  submitExam(reason) {
    const s = this.session; if (!s || s.finished) return;
    for (const item of s.items) if (!item.done && item.picked.length) this.commit(item, true);
    this.finish(reason);
  },
  finish(reason) {
    const s = this.session;
    if (!s || s.finished) return;
    this.stopTimer();
    s.finished = true; s.ended = Date.now();
    const sum = Quiz.summary(s);
    const p = this.p;
    Game.touchStreak(p);
    if (s.mode === 'exam') {
      const passed = sum.pct >= s.passPercent;
      p.exams.push({ at: s.ended, total: sum.total, right: sum.right, pct: sum.pct, passed, topic: s.topic, secs: sum.secs });
      if (p.exams.length > 50) p.exams = p.exams.slice(-50);
      if (passed) { p.xp += 50; s.xp += 50; }
    }
    const ctx = { combo: s.combo, hour: new Date().getHours(), dailyDone: Game.today(p).answered >= p.settings.dailyGoal, topicMastered: this.bank.topics.some(t => Game.topicMastery(p, this.bank, t.id).pct === 100), allRight: Game.allRight(p, this.bank) };
    Game.checkBadges(p, ctx).forEach(b => s.badges.push(b.id));
    this.save();
    this.lastSession = s; this.session = null;
    this.show('result', { reason: reason || '' }, { replace: true });
    const celebrate = s.mode === 'exam' ? sum.pct >= s.passPercent : (sum.pct >= 80 && sum.total >= 5);
    if (celebrate) setTimeout(() => U.confetti(), 200);
  },
  quit() {
    if (!this.session) return;
    if (!confirm('Session abbrechen? Bereits beantwortete Fragen bleiben gespeichert.')) return;
    this.stopTimer(); this.session = null; this.show('home', {}, { replace: true });
  },
  startTimer() {
    this.stopTimer();
    const s = this.session;
    if (!s || !s.limitSec) return;
    const tick = () => {
      const left = s.limitSec - (Date.now() - s.started) / 1000;
      const el = this.el.querySelector('[data-timer]');
      if (el) { el.textContent = U.fmtTime(left); el.classList.toggle('warn', left < 60); }
      if (left <= 0) { U.toast('⏰ Zeit abgelaufen'); this.submitExam('time'); }
    };
    tick(); this.timer = setInterval(tick, 1000);
  },
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },

  onKey(e) {
    if (this.screen !== 'quiz' || !this.session || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    const k = e.key.toLowerCase();
    const pos = 'abcdefgh'.indexOf(k) >= 0 ? 'abcdefgh'.indexOf(k) : (/^[1-8]$/.test(k) ? Number(k) - 1 : -1);
    if (pos >= 0) { const btn = this.el.querySelectorAll('.answer')[pos]; if (btn && !btn.disabled) { btn.click(); e.preventDefault(); } return; }
    if (k === 'enter' || k === ' ' || k === 'arrowright') { const btn = this.el.querySelector('[data-action=check]:not(:disabled), [data-action=next]:not(:disabled)'); if (btn) { btn.click(); e.preventDefault(); } }
    if (k === 'arrowleft') { const btn = this.el.querySelector('[data-action=prev]:not(:disabled)'); if (btn) btn.click(); }
  },
  // ---------- Events ----------
  onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || !this.el.contains(el)) return;
    const a = el.dataset.action, d = el.dataset;
    const fn = this.actions[a];
    if (fn) { e.preventDefault(); fn.call(this, d, el, e); }
  },
  actions: {
    nav(d) { this.show(d.screen); },
    back() { history.length > 1 ? history.back() : this.show('home'); },
    'pick-profile'(d) { const p = Store.profiles().find(x => x.id === d.id); if (p) this.login(p); },
    'start-learn'(d) { this.start('learn', d.topic || 'all', Number(d.n) || 10); },
    'start-review'(d) { this.start('review', d.topic || 'all', Number(d.n) || 15); },
    'open-topic'(d) { this.show('topic', { id: d.id }); },
    'exam-topic'(d) { this.show('exam', { topic: d.topic }); },
    answer(d) {
      const s = this.session; if (!s) return;
      const item = this.current(); if (item.done) return;
      const idx = Number(d.idx);
      if (Quiz.isMulti(item.q)) { item.picked = item.picked.includes(idx) ? item.picked.filter(i => i !== idx) : [...item.picked, idx]; this.render(); return; }
      item.picked = item.picked[0] === idx && s.mode === 'exam' ? [] : [idx];
      if (s.mode === 'exam') { this.render(); return; }
      this.commit(item); this.render();
    },
    check() { const item = this.current(); if (!item.done && item.picked.length) { this.commit(item); this.render(); } },
    next() {
      const s = this.session; if (!s) return;
      const item = this.current();
      if (s.mode === 'exam') { if (s.i + 1 >= s.items.length) { this.args = { overview: true }; this.render(); } else { s.i++; this.render(); } return; }
      if (!item.done) { if (!item.picked.length) return; this.commit(item); }
      this.next();
    },
    prev() { const s = this.session; if (s && s.i > 0) { s.i--; this.args = {}; this.render(); } },
    goto(d) { const s = this.session; if (s) { s.i = Math.max(0, Math.min(s.items.length - 1, Number(d.i))); this.args = {}; this.render(); } },
    flag() { const item = this.current(); item.flagged = !item.flagged; this.render(); },
    overview() { this.args = { overview: !this.args.overview }; this.render(); },
    quit() { this.quit(); },
    'finish-exam'() {
      const s = this.session; if (!s) return;
      const open = s.items.filter(it => !it.picked.length).length;
      if (!confirm(open ? `Prüfung abgeben? ${open} ${open === 1 ? 'Frage ist' : 'Fragen sind'} noch unbeantwortet und ${open === 1 ? 'zählt' : 'zählen'} als falsch.` : 'Prüfung jetzt abgeben?')) return;
      this.submitExam('manual');
    },
    'retry-wrong'() { const s = this.lastSession; if (s) this.startFromQuestions('review', s.items.filter(it => !it.correct).map(it => it.q)); },
    'retry-same'() { const s = this.lastSession; if (s) { if (s.mode === 'exam') this.show('exam', { topic: s.topic }); else this.startFromQuestions(s.mode, s.items.map(it => it.q)); } },
    async share() {
      const s = this.lastSession; if (!s) return;
      const sum = Quiz.summary(s);
      const lv = Game.levelFor(this.p.xp), rank = Game.rankFor(lv.level);
      const text = s.mode === 'exam'
        ? `🛩️ Prüfungssimulation ${sum.pct >= s.passPercent ? 'bestanden' : 'absolviert'}: ${sum.right}/${sum.total} richtig (${sum.pct} %). Level ${lv.level} ${rank.icon} ${rank.name}. Schaffst du das auch?`
        : `🛩️ Gerade ${sum.right}/${sum.total} Flugschul-Fragen richtig (${sum.pct} %) – Level ${lv.level} ${rank.icon} ${rank.name}. Schaffst du das auch?`;
      const url = location.href.split('#')[0];
      if (navigator.share) { try { await navigator.share({ title: 'Flugschule Prüfungstrainer', text, url }); return; } catch (e) { /* abgebrochen */ } }
      U.toast((await U.copy(text + ' ' + url)) ? 'In die Zwischenablage kopiert' : 'Teilen nicht möglich');
    },
    toggle(d, el) { const t = this.el.querySelector(d.target); if (t) { t.hidden = !t.hidden; el.classList.toggle('open', !t.hidden); } },
    export() {
      const data = { type: 'flugschule-progress', v: 1, exportedAt: new Date().toISOString(), profile: { name: this.profile.name, email: this.profile.email }, progress: this.p };
      U.download(`flugschule-fortschritt-${U.todayKey()}.json`, JSON.stringify(data));
      U.toast('Sicherung wird heruntergeladen');
    },
    async 'export-copy'() {
      const data = { type: 'flugschule-progress', v: 1, exportedAt: new Date().toISOString(), profile: { name: this.profile.name, email: this.profile.email }, progress: this.p };
      U.toast((await U.copy(JSON.stringify(data))) ? 'Sicherung in die Zwischenablage kopiert' : 'Kopieren nicht möglich');
    },
    'switch-profile'() { Store.del('current'); this.profile = null; this.p = null; this.show('login', {}, { replace: true }); },
    lock() { Store.del('key'); Store.del('current'); this.key = null; this.bank = null; this.profile = null; this.p = null; this.payload = null; this.show('lock', {}, { replace: true }); },
    reset() {
      if (!confirm('Wirklich den gesamten Fortschritt dieses Profils löschen?')) return;
      this.p = Store.emptyProgress(); this.save(); U.toast('Fortschritt zurückgesetzt'); this.render();
    },
    'delete-profile'() {
      if (!confirm('Profil und Fortschritt auf diesem Gerät löschen?')) return;
      Store.del('p:' + this.profile.id); Store.saveProfiles(Store.profiles().filter(x => x.id !== this.profile.id)); Store.del('current');
      this.profile = null; this.p = null; this.show('login', {}, { replace: true });
    }
  },
  onSubmit(e) {
    const form = e.target.closest('form[data-form]'); if (!form) return;
    e.preventDefault();
    const fn = this.forms[form.dataset.form];
    if (fn) fn.call(this, form, new FormData(form));
  },
  forms: {
    async unlock(form, fd) {
      const btn = form.querySelector('button[type=submit]'), err = form.querySelector('[data-err]');
      btn.disabled = true; btn.textContent = 'Entschlüssele…'; err.textContent = '';
      try {
        const payload = await this.fetchPayload();
        const { key, bank } = await FSCrypto.unlock(payload, String(fd.get('pw')));
        this.key = key; this.bank = bank;
        if (fd.get('remember')) Store.set('key', await FSCrypto.exportKey(key));
        this.afterUnlock();
      } catch (ex) {
        err.textContent = (ex && ex.name === 'OperationError') ? 'Falsches Passwort.' : ('Fehler: ' + (ex.message || ex));
        btn.disabled = false; btn.textContent = 'Entsperren';
        U.vibrate([60, 40, 60]);
      }
    },
    login(form, fd) {
      const name = String(fd.get('name')).trim(), email = String(fd.get('email')).trim().toLowerCase();
      if (!name || !email) return;
      const id = Store.profileId(email);
      const list = Store.profiles();
      let prof = list.find(x => x.id === id);
      if (!prof) { prof = { id, name, email, createdAt: Date.now() }; list.push(prof); Store.saveProfiles(list); }
      this.login(prof);
    },
    exam(form, fd) {
      const topic = String(fd.get('topic')), n = Number(fd.get('n')), minutes = Number(fd.get('minutes'));
      this.start('exam', topic, n, { limitSec: minutes > 0 ? minutes * 60 : 0 });
    },
    goal(form, fd) { this.p.settings.dailyGoal = Number(fd.get('goal')) || 20; this.save(); U.toast('Tagesziel gespeichert'); this.render(); },
    import(form, fd) { this.importText(String(fd.get('data') || '')); }
  },
  onChange(e) {
    const input = e.target;
    if (input.matches('input[type=file][data-import]') && input.files[0]) {
      input.files[0].text().then(t => this.importText(t));
    }
    if (input.matches('select[name=topic][data-exam-topic]')) {
      this.args = Object.assign({}, this.args, { topic: input.value, n: this.el.querySelector('select[name=n]')?.value, minutes: this.el.querySelector('select[name=minutes]')?.value });
      this.render();
    }
  },
  importText(text) {
    try {
      const data = JSON.parse(text.trim());
      if (data.type !== 'flugschule-progress' || !data.progress) throw new Error('Kein gültiger Export');
      if (!confirm(`Fortschritt von „${data.profile?.name || '?'}“ (${data.profile?.email || '?'}) importieren? Der aktuelle Fortschritt dieses Profils wird ersetzt.`)) return;
      this.p = Object.assign(Store.emptyProgress(), data.progress);
      this.save(); U.toast('Fortschritt importiert', { kind: 'ok' }); this.render();
    } catch (ex) { U.toast('Import fehlgeschlagen: ' + ex.message, { kind: 'bad' }); }
  },

  // ---------- Views ----------
  views: {
    loading() { return `<div class="screen center"><div class="hero"><div class="logo">🛩️</div><p class="muted">Lade…</p></div></div>`; },
    error({ msg }) { return `<div class="screen center"><div class="card"><h2>Hoppla</h2><p>${U.esc(msg)}</p></div></div>`; },
    lock() {
      return `<div class="screen center lock">
        <div class="hero"><div class="logo">🛩️</div><h1>Flugschule</h1><p class="sub">Prüfungstrainer</p></div>
        <form class="card" data-form="unlock">
          <label>Zugangspasswort<input type="password" name="pw" autocomplete="current-password" required autofocus></label>
          <label class="check"><input type="checkbox" name="remember" checked> Auf diesem Gerät merken</label>
          <button class="btn primary big" type="submit">Entsperren</button>
          <p class="err" data-err></p>
        </form>
        <p class="muted small">Die Fragen sind verschlüsselt gespeichert und werden erst mit dem Passwort auf deinem Gerät entschlüsselt.</p>
      </div>`;
    },
    login() {
      const list = Store.profiles();
      return `<div class="screen">
        <header class="top"><h1>Wer lernt heute?</h1></header>
        ${list.length ? `<div class="card list">${list.map(p => `<button type="button" class="row" data-action="pick-profile" data-id="${p.id}"><span class="avatar">${U.esc(p.name[0] || '?').toUpperCase()}</span><span class="grow"><b>${U.esc(p.name)}</b><br><small class="muted">${U.esc(p.email)}</small></span><span class="chev">›</span></button>`).join('')}</div>` : ''}
        <form class="card" data-form="login">
          <h2>${list.length ? 'Neues Profil' : 'Profil anlegen'}</h2>
          <label>Name<input name="name" required maxlength="40" autocomplete="name" ${list.length ? '' : 'autofocus'}></label>
          <label>E-Mail<input type="email" name="email" required autocomplete="email"></label>
          <button class="btn primary big" type="submit">Los geht's ✈️</button>
        </form>
        <p class="muted small">Dein Fortschritt wird lokal auf diesem Gerät gespeichert. Unter „Profil“ kannst du ihn sichern und auf ein anderes Gerät übertragen.</p>
      </div>`;
    },
    home() {
      const p = this.p, b = this.bank;
      const lv = Game.levelFor(p.xp), rank = Game.rankFor(lv.level), nextRank = Game.nextRank(lv.level);
      const streak = Game.streakAlive(p), today = Game.today(p), goal = p.settings.dailyGoal;
      const review = Game.reviewCount(p, b), due = Game.dueCount(p, b);
      const unseen = b.questions.filter(q => !p.q[q.id]).length;
      const mastered = b.questions.filter(q => (p.q[q.id]?.box || 0) >= 3).length;
      const goalPct = U.pct(Math.min(today.answered, goal), goal);
      return `<div class="screen">
        ${b.meta?.demo ? `<div class="banner">⚠️ Demo-Inhalte – die echten Fragen aus der PDF folgen.</div>` : ''}
        <header class="top row">
          <div class="grow"><h1>Hallo ${U.esc(this.profile.name.split(' ')[0])} 👋</h1><p class="muted">${rank.icon} ${rank.name} · Level ${lv.level}</p></div>
          <div class="goal">${U.ring(goalPct, 64, 7, goalPct >= 100 ? 'done' : '')}<div class="goal-txt">${today.answered}<small>/${goal}</small></div></div>
        </header>
        <div class="card level">
          <div class="row"><span class="grow"><b>${p.xp} XP</b> <span class="muted small">· noch ${lv.next - p.xp} bis Level ${lv.level + 1}</span></span>${nextRank ? `<span class="muted small">${nextRank.icon} ab Lvl ${nextRank.level}</span>` : ''}</div>
          <div class="bar"><div style="width:${Math.round(lv.progress * 100)}%"></div></div>
          <div class="statrow">
            <div><b>${streak} 🔥</b><small>${streak === 1 ? 'Tag' : 'Tage'} Streak</small></div>
            <div><b>${mastered}/${b.questions.length}</b><small>gemeistert</small></div>
            <div><b>${U.pct(p.correct, p.answered)} %</b><small>Trefferquote</small></div>
          </div>
        </div>
        <button type="button" class="card action primary" data-action="start-learn" data-topic="all" data-n="10">
          <span class="ic">🚀</span><span class="grow"><b>Weiterlernen</b><small>10 Fragen, clever gemischt${due ? ` · ${due} fällig` : ''}${unseen ? ` · ${unseen} neu` : ''}</small></span><span class="chev">›</span>
        </button>
        <button type="button" class="card action" data-action="start-review" data-topic="all" data-n="15" ${review ? '' : 'disabled'}>
          <span class="ic">🔁</span><span class="grow"><b>Fehler wiederholen</b><small>${review ? `${review} ${review === 1 ? 'Frage wartet' : 'Fragen warten'} auf dich` : 'Aktuell nichts zu wiederholen 🎉'}</small></span><span class="chev">›</span>
        </button>
        <button type="button" class="card action" data-action="nav" data-screen="topics">
          <span class="ic">📚</span><span class="grow"><b>Nach Thema lernen</b><small>${b.topics.length} Themen · ${b.questions.length} Fragen</small></span><span class="chev">›</span>
        </button>
        <button type="button" class="card action" data-action="nav" data-screen="exam">
          <span class="ic">📝</span><span class="grow"><b>Prüfungssimulation</b><small>${this.examMeta().questions} Fragen · ${this.examMeta().minutes} Min · ab ${this.examMeta().passPercent} % bestanden</small></span><span class="chev">›</span>
        </button>
        ${this.views.recentBadges.call(this)}
        <p class="muted small center">${U.esc(b.meta?.title || '')}${b.meta?.version ? ` · Katalog ${U.esc(b.meta.version)}` : ''}</p>
      </div>`;
    },
    recentBadges() {
      const ids = Object.entries(this.p.badges).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
      if (!ids.length) return '';
      return `<div class="card"><div class="row"><b class="grow">Letzte Abzeichen</b><button type="button" class="link" data-action="nav" data-screen="stats">Alle ›</button></div><div class="badges mini">${ids.map(id => { const b = Game.badgeById(id); return b ? `<div class="badge on" title="${U.esc(b.desc)}"><span class="ic">${b.icon}</span><small>${U.esc(b.name)}</small></div>` : ''; }).join('')}</div></div>`;
    },
    topics() {
      return `<div class="screen">
        <header class="top"><h1>Themen</h1><p class="muted">Tippe ein Thema an, um gezielt zu lernen.</p></header>
        <div class="card list">${this.bank.topics.map(t => { const m = Game.topicMastery(this.p, this.bank, t.id); return `
          <button type="button" class="row" data-action="open-topic" data-id="${U.esc(t.id)}">
            <span class="ic">${t.icon || '📘'}</span>
            <span class="grow"><b>${U.esc(t.name)}</b><div class="bar small"><div style="width:${m.pct}%"></div></div><small class="muted">${m.mastered}/${m.total} gemeistert${m.seen < m.total ? ` · ${m.total - m.seen} neu` : ''}</small></span>
            <span class="chev">›</span></button>`; }).join('')}</div>
      </div>`;
    },
    topic({ id }) {
      const t = this.bank.topics.find(x => x.id === id); if (!t) return this.views.topics.call(this);
      const m = Game.topicMastery(this.p, this.bank, id), review = Game.reviewCount(this.p, this.bank, id);
      const sizes = [10, 20].filter(n => n < m.total);
      return `<div class="screen">
        <header class="top row"><button type="button" class="icon" data-action="back">‹</button><div class="grow"><h1>${t.icon || '📘'} ${U.esc(t.name)}</h1></div></header>
        <div class="card center">
          ${U.ring(m.pct, 120, 12)}<div class="ring-label"><b>${m.pct} %</b><small>gemeistert</small></div>
          <div class="statrow"><div><b>${m.total}</b><small>Fragen</small></div><div><b>${m.seen}</b><small>gesehen</small></div><div><b>${m.accuracy} %</b><small>Trefferquote</small></div></div>
        </div>
        ${t.description ? `<div class="card"><p>${U.esc(t.description)}</p></div>` : ''}
        <div class="stack">
          ${sizes.map(n => `<button type="button" class="btn primary big" data-action="start-learn" data-topic="${U.esc(id)}" data-n="${n}">${n} Fragen lernen</button>`).join('')}
          <button type="button" class="btn ${sizes.length ? '' : 'primary'} big" data-action="start-learn" data-topic="${U.esc(id)}" data-n="${m.total}">Alle ${m.total} Fragen lernen</button>
          <button type="button" class="btn big" data-action="start-review" data-topic="${U.esc(id)}" data-n="20" ${review ? '' : 'disabled'}>🔁 Wiederholen (${review})</button>
          <button type="button" class="btn big ghost" data-action="exam-topic" data-topic="${U.esc(id)}">📝 Prüfung nur zu diesem Thema</button>
        </div>
      </div>`;
    },
    exam({ topic = 'all', n, minutes } = {}) {
      const meta = this.examMeta();
      const pool = Quiz.pool(this.bank, topic).length;
      const perQ = meta.minutes / meta.questions;
      const counts = [...new Set([10, 20, meta.questions, 30, 40, 60, pool])].filter(x => x <= pool).sort((a, b) => a - b);
      const selN = n && counts.includes(Number(n)) ? Number(n) : (counts.includes(meta.questions) ? meta.questions : counts[counts.length - 1]);
      const suggested = Math.max(1, Math.round(selN * perQ));
      const times = [...new Set([0, suggested, Math.round(suggested * 1.5), Math.round(suggested * 0.75)])].sort((a, b) => a - b);
      const selMin = minutes != null && times.includes(Number(minutes)) ? Number(minutes) : suggested;
      const last = this.p.exams.slice(-3).reverse();
      return `<div class="screen">
        <header class="top"><h1>Prüfungssimulation</h1><p class="muted">Wie in der echten Prüfung: keine Hilfe, Auswertung am Ende. Bestanden ab ${meta.passPercent} %.</p></header>
        <form class="card" data-form="exam">
          <label>Themenbereich<select name="topic" data-exam-topic>
            <option value="all" ${topic === 'all' ? 'selected' : ''}>Alle Themen (${this.bank.questions.length} Fragen)</option>
            ${this.bank.topics.map(t => `<option value="${U.esc(t.id)}" ${t.id === topic ? 'selected' : ''}>${U.esc(t.name)} (${Quiz.pool(this.bank, t.id).length})</option>`).join('')}
          </select></label>
          <label>Anzahl Fragen<select name="n">${counts.map(c => `<option value="${c}" ${c === selN ? 'selected' : ''}>${c}${c === meta.questions ? ' (wie Prüfung)' : ''}</option>`).join('')}</select></label>
          <label>Zeitlimit<select name="minutes">${times.map(m => `<option value="${m}" ${m === selMin ? 'selected' : ''}>${m ? m + ' Minuten' : 'Ohne Zeitlimit'}${m === suggested ? ' (empfohlen)' : ''}</option>`).join('')}</select></label>
          <button class="btn primary big" type="submit">Prüfung starten 📝</button>
        </form>
        ${last.length ? `<div class="card"><b>Letzte Prüfungen</b><div class="list plain">${last.map(e => `<div class="row"><span class="ic">${e.passed ? '✅' : '❌'}</span><span class="grow"><b>${e.pct} %</b> · ${e.right}/${e.total} richtig<br><small class="muted">${U.fmtDate(e.at)} · ${U.esc(this.topicName(e.topic))}</small></span></div>`).join('')}</div></div>` : ''}
      </div>`;
    },
    quiz({ overview } = {}) {
      const s = this.session; if (!s) return this.views.home.call(this);
      const isExam = s.mode === 'exam';
      if (isExam && overview) return this.views.examOverview.call(this);
      const item = this.current(), q = item.q, multi = Quiz.isMulti(q), correct = Quiz.correctSet(q);
      const last = s.i + 1 >= s.items.length;
      const letters = 'ABCDEFGH';
      const answers = item.order.map((idx, pos) => {
        let cls = 'answer';
        const picked = item.picked.includes(idx);
        if (item.done && !isExam) { if (picked && correct.has(idx)) cls += ' correct'; else if (picked) cls += ' wrong'; else if (correct.has(idx)) cls += ' reveal'; }
        else if (picked) cls += ' selected';
        return `<button type="button" class="${cls}" data-action="answer" data-idx="${idx}" ${item.done ? 'disabled' : ''}><span class="letter">${letters[pos]}</span><span class="txt">${U.esc(q.a[idx])}</span>${multi ? `<span class="box">${picked ? '✓' : ''}</span>` : ''}</button>`;
      }).join('');
      let footer = '';
      if (isExam) {
        footer = `<div class="row gap exam-nav">
          <button type="button" class="btn" data-action="prev" ${s.i === 0 ? 'disabled' : ''} aria-label="Zurück">‹</button>
          <button type="button" class="btn ${item.flagged ? 'flagged' : ''}" data-action="flag" aria-label="Markieren">${item.flagged ? '🚩' : '⚑'}</button>
          <button type="button" class="btn" data-action="overview" aria-label="Übersicht">▦</button>
          <button type="button" class="btn primary grow" data-action="next">${last ? 'Zur Übersicht' : (item.picked.length ? 'Weiter ›' : 'Überspringen ›')}</button>
        </div>`;
      } else if (item.done) {
        footer = `<div class="feedback ${item.correct ? 'ok' : 'bad'}">
          <b>${item.correct ? `Richtig! +${item.xp} XP${s.combo >= 3 ? ` · 🔥 ${s.combo}er-Serie` : ''}` : 'Leider falsch.'}</b>
          ${!item.correct ? `<p>Richtig wäre: <b>${[...correct].map(i => letters[item.order.indexOf(i)]).join(', ')}</b></p>` : ''}
          ${q.explanation ? `<p>${U.esc(q.explanation)}</p>` : ''}${q.ref ? `<small class="muted">Quelle: ${U.esc(q.ref)}</small>` : ''}
        </div><button type="button" class="btn primary big" data-action="next" autofocus>${last ? 'Ergebnis anzeigen' : 'Weiter ›'}</button>`;
      } else if (multi) {
        footer = `<button type="button" class="btn primary big" data-action="check" ${item.picked.length ? '' : 'disabled'}>Antwort prüfen</button>`;
      }
      return `<div class="screen quiz">
        <header class="quizbar">
          <button type="button" class="icon" data-action="quit" aria-label="Abbrechen">✕</button>
          <div class="progress grow"><div style="width:${U.pct(isExam ? s.items.filter(it => it.picked.length).length : s.i + (item.done ? 1 : 0), s.items.length)}%"></div></div>
          <span class="counter">${s.i + 1}/${s.items.length}</span>
          ${s.limitSec ? `<span class="timer" data-timer>${U.fmtTime(s.limitSec - (Date.now() - s.started) / 1000)}</span>` : (s.combo >= 3 ? `<span class="combo">🔥${s.combo}</span>` : '')}
        </header>
        <div class="card q">
          <div class="chips"><span class="chip">${this.topicIcon(q.topic)} ${U.esc(this.topicName(q.topic))}</span>${multi ? '<span class="chip alt">Mehrfachauswahl</span>' : ''}${isExam ? '<span class="chip alt">Prüfung</span>' : ''}</div>
          <p class="qtext">${U.esc(q.q)}</p>
          ${q.image ? `<img class="qimg" src="${U.esc(q.image)}" alt="Abbildung zur Frage">` : ''}
          <div class="answers">${answers}</div>
          ${footer}
        </div>
      </div>`;
    },
    examOverview() {
      const s = this.session;
      const answered = s.items.filter(it => it.picked.length).length, flagged = s.items.filter(it => it.flagged).length;
      return `<div class="screen quiz">
        <header class="quizbar">
          <button type="button" class="icon" data-action="quit" aria-label="Abbrechen">✕</button>
          <div class="grow"><b>Übersicht</b></div>
          ${s.limitSec ? `<span class="timer" data-timer>${U.fmtTime(s.limitSec - (Date.now() - s.started) / 1000)}</span>` : ''}
        </header>
        <div class="card">
          <p><b>${answered}/${s.items.length}</b> beantwortet${flagged ? ` · 🚩 ${flagged} markiert` : ''}${answered < s.items.length ? ` · <span class="warn-txt">${s.items.length - answered} offen</span>` : ''}</p>
          <div class="qgrid">${s.items.map((it, i) => `<button type="button" class="qcell ${it.picked.length ? 'answered' : ''} ${it.flagged ? 'flagged' : ''} ${i === s.i ? 'current' : ''}" data-action="goto" data-i="${i}">${i + 1}${it.flagged ? '<span class="fl">🚩</span>' : ''}</button>`).join('')}</div>
          <p class="muted small">Tippe eine Nummer, um zur Frage zu springen. Antworten kannst du bis zur Abgabe ändern.</p>
        </div>
        <div class="stack">
          <button type="button" class="btn primary big" data-action="finish-exam">Prüfung abgeben ✅</button>
          <button type="button" class="btn big" data-action="overview">Zurück zur Frage ${s.i + 1}</button>
        </div>
      </div>`;
    },
    result({ reason }) {
      const s = this.lastSession; if (!s) return this.views.home.call(this);
      const sum = Quiz.summary(s), isExam = s.mode === 'exam', passed = sum.pct >= s.passPercent;
      const letters = 'ABCDEFGH';
      const title = isExam ? (passed ? 'Bestanden! 🎉' : 'Nicht bestanden') : (sum.pct === 100 ? 'Perfekt! 🌟' : sum.pct >= 80 ? 'Stark! 💪' : sum.pct >= 60 ? 'Gut dabei 👍' : 'Weiter üben 🛠️');
      const badges = s.badges.map(id => Game.badgeById(id)).filter(Boolean);
      const wrong = s.items.filter(it => !it.correct);
      return `<div class="screen">
        <div class="card center result ${isExam ? (passed ? 'pass' : 'fail') : ''}">
          ${U.ring(sum.pct, 140, 14, isExam && !passed ? 'bad' : 'good')}<div class="ring-label big"><b>${sum.pct} %</b></div>
          <h1>${title}</h1>
          <p class="muted">${sum.right} von ${sum.total} richtig${sum.unanswered.length ? ` · ${sum.unanswered.length} unbeantwortet` : ''} · ${U.fmtTime(sum.secs)} Min${reason === 'time' ? ' · Zeit abgelaufen' : ''}</p>
          ${isExam ? `<p class="muted small">Bestehensgrenze ${s.passPercent} %${passed ? ' · +50 XP Bonus' : ''}</p>` : ''}
          <div class="statrow"><div><b>+${s.xp}</b><small>XP</small></div><div><b>🔥 ${s.maxCombo}</b><small>beste Serie</small></div><div><b>${Game.streakAlive(this.p)}</b><small>Tage Streak</small></div></div>
          ${s.levelUps ? `<p class="lvl">⬆️ Level ${Game.levelFor(this.p.xp).level} erreicht!</p>` : ''}
          ${badges.length ? `<div class="badges mini">${badges.map(b => `<div class="badge on new"><span class="ic">${b.icon}</span><small>${U.esc(b.name)}</small></div>`).join('')}</div>` : ''}
        </div>
        <div class="stack">
          ${wrong.length ? `<button type="button" class="btn primary big" data-action="retry-wrong">🔁 ${wrong.length} ${wrong.length === 1 ? 'Fehler' : 'Fehler'} nochmal üben</button>` : ''}
          <button type="button" class="btn big" data-action="share">📤 Ergebnis teilen</button>
          <div class="row gap"><button type="button" class="btn grow" data-action="retry-same">Nochmal</button><button type="button" class="btn grow" data-action="nav" data-screen="home">Startseite</button></div>
        </div>
        ${wrong.length ? `<h2 class="sect">Das solltest du dir ansehen</h2>${wrong.map(it => { const c = Quiz.correctSet(it.q); return `
          <div class="card review">
            <div class="chips"><span class="chip">${U.esc(this.topicName(it.q.topic))}</span></div>
            <p class="qtext">${U.esc(it.q.q)}</p>
            ${it.picked.length ? `<p class="ans bad">✗ Deine Antwort: ${it.picked.map(i => U.esc(it.q.a[i])).join(' / ')}</p>` : '<p class="ans bad">✗ Nicht beantwortet</p>'}
            <p class="ans good">✓ Richtig: ${[...c].map(i => U.esc(it.q.a[i])).join(' / ')}</p>
            ${it.q.explanation ? `<p class="muted small">${U.esc(it.q.explanation)}</p>` : ''}
          </div>`; }).join('')}` : ''}
      </div>`;
    },
    stats() {
      const p = this.p, b = this.bank, lv = Game.levelFor(p.xp), rank = Game.rankFor(lv.level);
      const days = Array.from({ length: 7 }, (_, i) => { const k = U.dayKeyOffset(i - 6); return { k, d: p.days[k] || { answered: 0 }, label: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(k + 'T00:00:00').getDay()] }; });
      const max = Math.max(1, ...days.map(x => x.d.answered));
      const exams = p.exams.slice(-5).reverse();
      return `<div class="screen">
        <header class="top"><h1>Fortschritt</h1><p class="muted">${rank.icon} ${rank.name} · Level ${lv.level} · ${p.xp} XP</p></header>
        <div class="card"><div class="statrow four">
          <div><b>${p.answered}</b><small>beantwortet</small></div><div><b>${U.pct(p.correct, p.answered)} %</b><small>richtig</small></div>
          <div><b>${p.streak.best || 0}</b><small>bester Streak</small></div><div><b>${p.exams.filter(e => e.passed).length}</b><small>Prüfungen ✓</small></div>
        </div></div>
        <div class="card"><b>Letzte 7 Tage</b><div class="chart">${days.map(x => `<div class="col"><div class="colbar" style="height:${Math.round(x.d.answered / max * 100)}%"><span>${x.d.answered || ''}</span></div><small>${x.label}</small></div>`).join('')}</div></div>
        <div class="card"><b>Themen</b><div class="list plain">${b.topics.map(t => { const m = Game.topicMastery(p, b, t.id); return `<div class="row"><span class="ic">${t.icon || '📘'}</span><span class="grow"><div class="row"><span class="grow">${U.esc(t.name)}</span><small class="muted">${m.pct} %</small></div><div class="bar small"><div style="width:${m.pct}%"></div></div></span></div>`; }).join('')}</div></div>
        <div class="card"><b>Abzeichen (${Object.keys(p.badges).length}/${Game.badges.length})</b><div class="badges">${Game.badges.map(bd => `<div class="badge ${p.badges[bd.id] ? 'on' : ''}" title="${U.esc(bd.desc)}"><span class="ic">${bd.icon}</span><small>${U.esc(bd.name)}</small><span class="desc">${U.esc(bd.desc)}</span></div>`).join('')}</div></div>
        ${exams.length ? `<div class="card"><b>Prüfungen</b><div class="list plain">${exams.map(e => `<div class="row"><span class="ic">${e.passed ? '✅' : '❌'}</span><span class="grow"><b>${e.pct} %</b> · ${e.right}/${e.total}<br><small class="muted">${U.fmtDate(e.at)} · ${U.esc(this.topicName(e.topic))} · ${U.fmtTime(e.secs)} Min</small></span></div>`).join('')}</div></div>` : ''}
      </div>`;
    },
    profile() {
      const p = this.p, pr = this.profile;
      return `<div class="screen">
        <header class="top row"><span class="avatar big">${U.esc(pr.name[0] || '?').toUpperCase()}</span><div class="grow"><h1>${U.esc(pr.name)}</h1><p class="muted">${U.esc(pr.email)}</p></div></header>
        <form class="card" data-form="goal"><label>Tagesziel<select name="goal">${[5, 10, 20, 30, 50, 100].map(g => `<option value="${g}" ${g === p.settings.dailyGoal ? 'selected' : ''}>${g} Fragen pro Tag</option>`).join('')}</select></label><button class="btn" type="submit">Speichern</button></form>
        <div class="card">
          <b>Fortschritt sichern & übertragen</b>
          <p class="muted small">Dein Fortschritt liegt nur auf diesem Gerät. Sichere ihn als Datei, um ihn auf ein anderes Gerät zu übertragen oder nach dem Löschen der Browserdaten wiederherzustellen.</p>
          <div class="row gap"><button type="button" class="btn grow" data-action="export">⬇️ Sicherung herunterladen</button><button type="button" class="btn" data-action="export-copy">📋</button></div>
          <button type="button" class="link" data-action="toggle" data-target="#import">Sicherung wiederherstellen…</button>
          <form id="import" hidden data-form="import">
            <label class="file"><input type="file" accept="application/json,.json" data-import> 📂 Datei auswählen</label>
            <label>…oder Inhalt einfügen<textarea name="data" rows="3" placeholder='{"type":"flugschule-progress",…}'></textarea></label>
            <button class="btn" type="submit">Importieren</button>
          </form>
        </div>
        <div class="card">
          <b>App installieren</b>
          <p class="muted small">Auf dem Handy: Browser-Menü → „Zum Startbildschirm hinzufügen“. Dann läuft der Trainer wie eine App – auch offline.</p>
        </div>
        <div class="stack">
          <button type="button" class="btn" data-action="switch-profile">👥 Profil wechseln</button>
          <button type="button" class="btn" data-action="lock">🔒 Abmelden & Passwort vergessen</button>
          <button type="button" class="btn danger ghost" data-action="reset">Fortschritt zurücksetzen</button>
          <button type="button" class="btn danger ghost" data-action="delete-profile">Profil auf diesem Gerät löschen</button>
        </div>
        <p class="muted small center">Flugschule Prüfungstrainer v${this.version}${this.bank.meta?.version ? ` · Katalog ${U.esc(this.bank.meta.version)}` : ''} · ${this.bank.questions.length} Fragen</p>
      </div>`;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
