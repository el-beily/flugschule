'use strict';
// Gamification: XP, Level, Ränge, Abzeichen, Streak, Leitner-Boxen
const Game = {
  intervals: [0, 1, 3, 7, 14, 30], // Tage bis zur Wiedervorlage je Box
  levelXp(n) { return 50 * (n - 1) * n; },
  levelFor(xp) {
    let n = 1; while (this.levelXp(n + 1) <= xp) n++;
    const cur = this.levelXp(n), next = this.levelXp(n + 1);
    return { level: n, cur, next, progress: (xp - cur) / (next - cur) };
  },
  ranks: [[1, 'Flugschüler', '🎒'], [3, 'Solo-Pilot', '🛩️'], [5, 'Navigator', '🧭'], [7, 'Co-Pilot', '🧑‍✈️'], [9, 'Kapitän', '✈️'], [12, 'Fluglehrer', '🎓'], [15, 'Flieger-Ass', '🏆']],
  rankFor(level) { let r = this.ranks[0]; for (const x of this.ranks) if (level >= x[0]) r = x; return { name: r[1], icon: r[2], level: r[0] }; },
  nextRank(level) { const r = this.ranks.find(x => x[0] > level); return r ? { name: r[1], icon: r[2], level: r[0] } : null; },
  badges: [
    { id: 'first', icon: '🐣', name: 'Rollout', desc: 'Erste Frage beantwortet', check: p => p.answered >= 1 },
    { id: 'q50', icon: '🛫', name: 'Abgehoben', desc: '50 Fragen beantwortet', check: p => p.answered >= 50 },
    { id: 'q200', icon: '🌤️', name: 'Reiseflughöhe', desc: '200 Fragen beantwortet', check: p => p.answered >= 200 },
    { id: 'q500', icon: '🌍', name: 'Langstrecke', desc: '500 Fragen beantwortet', check: p => p.answered >= 500 },
    { id: 'q1000', icon: '🚀', name: 'Orbit', desc: '1000 Fragen beantwortet', check: p => p.answered >= 1000 },
    { id: 'combo10', icon: '🔥', name: 'Heißer Reifen', desc: '10 richtige Antworten in Folge', check: (p, c) => c.combo >= 10 },
    { id: 'combo25', icon: '⚡', name: 'Überschall', desc: '25 richtige Antworten in Folge', check: (p, c) => c.combo >= 25 },
    { id: 'streak3', icon: '📅', name: 'Dranbleiber', desc: '3 Tage in Folge gelernt', check: p => p.streak.count >= 3 },
    { id: 'streak7', icon: '🗓️', name: 'Wochenflieger', desc: '7 Tage in Folge gelernt', check: p => p.streak.count >= 7 },
    { id: 'streak30', icon: '🏅', name: 'Eiserne Disziplin', desc: '30 Tage in Folge gelernt', check: p => p.streak.count >= 30 },
    { id: 'daily', icon: '🎯', name: 'Tagesziel', desc: 'Tagesziel zum ersten Mal erreicht', check: (p, c) => c.dailyDone },
    { id: 'exam1', icon: '📜', name: 'Bestanden', desc: 'Erste Prüfungssimulation bestanden', check: p => p.exams.some(e => e.passed) },
    { id: 'exam5', icon: '🎖️', name: 'Prüfungsprofi', desc: '5 Prüfungssimulationen bestanden', check: p => p.exams.filter(e => e.passed).length >= 5 },
    { id: 'exam100', icon: '💯', name: 'Fehlerfrei', desc: 'Prüfungssimulation mit 100 % bestanden', check: p => p.exams.some(e => e.pct === 100 && e.total >= 10) },
    { id: 'topic', icon: '🧠', name: 'Themenmeister', desc: 'Alle Fragen eines Themas sicher (3× in Folge richtig)', check: (p, c) => c.topicMastered },
    { id: 'early', icon: '🌅', name: 'Frühaufsteher', desc: 'Vor 7 Uhr gelernt', check: (p, c) => c.hour < 7 },
    { id: 'night', icon: '🦉', name: 'Nachtflug', desc: 'Nach 23 Uhr gelernt', check: (p, c) => c.hour >= 23 },
    { id: 'allright', icon: '🏆', name: 'Prüfungsreif', desc: 'Jede Frage mindestens einmal richtig beantwortet', check: (p, c) => c.allRight }
  ],
  badgeById(id) { return this.badges.find(b => b.id === id); },
  checkBadges(p, ctx) {
    const fresh = [];
    for (const b of this.badges) { if (!p.badges[b.id] && b.check(p, ctx)) { p.badges[b.id] = Date.now(); fresh.push(b); } }
    return fresh;
  },
  touchStreak(p) {
    const today = U.todayKey();
    if (p.streak.last === today) return;
    if (p.streak.last && U.dayDiff(p.streak.last, today) === 1) p.streak.count++; else p.streak.count = 1;
    p.streak.last = today;
    p.streak.best = Math.max(p.streak.best || 0, p.streak.count);
  },
  streakAlive(p) { if (!p.streak.last) return 0; return U.dayDiff(p.streak.last, U.todayKey()) <= 1 ? p.streak.count : 0; },
  today(p) { return p.days[U.todayKey()] || { answered: 0, correct: 0, xp: 0 }; },
  // Antwort verbuchen: Leitner-Box, XP, Tagesstatistik. Gibt gewonnene XP zurück.
  recordAnswer(p, q, correct, ctx) {
    const now = Date.now();
    const e = p.q[q.id] || (p.q[q.id] = { box: 0, seen: 0, right: 0, wrong: 0, last: 0, due: 0 });
    const firstTime = e.seen === 0;
    e.seen++; e.last = now;
    let xp;
    if (correct) {
      e.right++; e.box = Math.min(e.box + 1, 5); e.due = now + this.intervals[e.box] * 86400000;
      xp = 10 + (firstTime ? 5 : 0) + (ctx.combo >= 5 ? 5 : 0) + (ctx.combo >= 10 ? 5 : 0) + (ctx.mode === 'exam' ? 5 : 0);
    } else { e.wrong++; e.box = 0; e.due = now; xp = 2; }
    p.xp += xp; p.answered++; if (correct) p.correct++;
    const k = U.todayKey();
    const day = p.days[k] || (p.days[k] = { answered: 0, correct: 0, xp: 0 });
    day.answered++; if (correct) day.correct++; day.xp += xp;
    this.touchStreak(p);
    return xp;
  },
  topicMastery(p, bank, topicId) {
    const qs = bank.questions.filter(q => q.topic === topicId);
    const mastered = qs.filter(q => (p.q[q.id]?.box || 0) >= 3).length;   // „sicher“: 3× in Folge richtig (Leitner-Box ≥ 3)
    const known = qs.filter(q => (p.q[q.id]?.right || 0) > 0).length;     // mindestens einmal richtig beantwortet
    const seen = qs.filter(q => p.q[q.id]).length;
    const right = qs.reduce((s, q) => s + (p.q[q.id]?.right || 0), 0);
    const total = qs.reduce((s, q) => s + (p.q[q.id]?.seen || 0), 0);
    return { total: qs.length, mastered, known, seen, pct: U.pct(known, qs.length), masteredPct: U.pct(mastered, qs.length), accuracy: U.pct(right, total) };
  },
  dueCount(p, bank, topic) {
    const now = Date.now();
    return bank.questions.filter(q => (!topic || topic === 'all' || q.topic === topic) && p.q[q.id] && p.q[q.id].due <= now && p.q[q.id].box < 5).length;
  },
  reviewCount(p, bank, topic) {
    const now = Date.now();
    return bank.questions.filter(q => { if (topic && topic !== 'all' && q.topic !== topic) return false; const e = p.q[q.id]; return e && ((e.wrong > 0 && e.box < 3) || (e.due <= now && e.box < 5)); }).length;
  },
  allRight(p, bank) { return bank.questions.every(q => (p.q[q.id]?.right || 0) > 0); }
};
