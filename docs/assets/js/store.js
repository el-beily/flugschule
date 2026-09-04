'use strict';
// Lokale Speicherung (localStorage). Profile + Fortschritt je Profil.
const Store = {
  P: 'fs:',
  get(k, def = null) { try { const v = localStorage.getItem(this.P + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(this.P + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(this.P + k); } catch (e) { /* ignore */ } },
  emptyProgress() {
    return { v: 1, xp: 0, answered: 0, correct: 0, q: {}, days: {}, streak: { count: 0, best: 0, last: null }, badges: {}, exams: [], settings: { dailyGoal: 20 }, createdAt: Date.now() };
  },
  loadProgress(id) {
    const p = this.get('p:' + id);
    if (!p) return this.emptyProgress();
    const base = this.emptyProgress();
    return Object.assign(base, p, { streak: Object.assign(base.streak, p.streak || {}), settings: Object.assign(base.settings, p.settings || {}) });
  },
  saveProgress(id, p) { return this.set('p:' + id, p); },
  profiles() { return this.get('profiles', []); },
  saveProfiles(list) { return this.set('profiles', list); },
  profileId(email) { return U.hash(String(email).trim().toLowerCase()); }
};
