'use strict';
// Quiz-Engine: Fragenauswahl + Session-Objekt
const Quiz = {
  pool(bank, topic) { return (!topic || topic === 'all') ? bank.questions.slice() : bank.questions.filter(q => q.topic === topic); },
  // Lernen: fällige Fragen (niedrige Box zuerst) gemischt mit neuen, dann der Rest
  pickLearn(bank, p, topic, n) {
    const now = Date.now();
    const due = [], unseen = [], rest = [];
    for (const q of this.pool(bank, topic)) {
      const e = p.q[q.id];
      if (!e) unseen.push(q); else if (e.due <= now && e.box < 5) due.push(q); else rest.push(q);
    }
    due.sort((a, b) => (p.q[a.id].box - p.q[b.id].box) || (p.q[a.id].due - p.q[b.id].due));
    rest.sort((a, b) => p.q[a.id].due - p.q[b.id].due);
    const u = U.shuffle(unseen), out = [];
    let di = 0, ui = 0;
    while (out.length < n && (di < due.length || ui < u.length)) {
      const wantNew = out.length % 3 === 2; // jede dritte Frage neu, wenn vorhanden
      if (ui < u.length && (wantNew || di >= due.length)) out.push(u[ui++]); else out.push(due[di++]);
    }
    for (const q of rest) { if (out.length >= n) break; out.push(q); }
    return U.shuffle(out);
  },
  pickReview(bank, p, topic, n) {
    const now = Date.now();
    const pool = this.pool(bank, topic).filter(q => { const e = p.q[q.id]; return e && ((e.wrong > 0 && e.box < 3) || (e.due <= now && e.box < 5)); });
    pool.sort((a, b) => (p.q[a.id].box - p.q[b.id].box) || (p.q[b.id].wrong - p.q[a.id].wrong));
    return U.shuffle(pool.slice(0, n));
  },
  pickExam(bank, p, topic, n) { return U.shuffle(this.pool(bank, topic)).slice(0, n); },
  create(mode, questions, opts = {}) {
    return {
      mode, topic: opts.topic || 'all', limitSec: opts.limitSec || 0, passPercent: opts.passPercent || 75,
      items: questions.map(q => ({ q, order: U.shuffle(q.a.map((_, i) => i)), picked: [], done: false, correct: null })),
      i: 0, started: Date.now(), ended: null, xp: 0, combo: 0, maxCombo: 0, badges: [], levelUps: 0, finished: false
    };
  },
  correctSet(q) { return new Set(Array.isArray(q.correct) ? q.correct : [q.correct]); },
  isMulti(q) { return Array.isArray(q.correct) && q.correct.length > 1; },
  grade(q, picked) { const c = this.correctSet(q); return picked.length === c.size && picked.every(i => c.has(i)); },
  summary(s) {
    const total = s.items.length, right = s.items.filter(it => it.correct === true).length;
    return { total, right, pct: U.pct(right, total), wrong: s.items.filter(it => it.done && !it.correct), unanswered: s.items.filter(it => !it.done), secs: Math.round(((s.ended || Date.now()) - s.started) / 1000) };
  }
};
