'use strict';
// Entschlüsselung des Fragenkatalogs (PBKDF2-SHA256 + AES-256-GCM) – Gegenstück zu tools/encrypt.mjs
const FSCrypto = {
  enc: new TextEncoder(), dec: new TextDecoder(),
  available() { return !!(window.crypto && crypto.subtle); },
  async deriveKey(password, salt, iterations) {
    const km = await crypto.subtle.importKey('raw', this.enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  },
  async decrypt(payload, key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: U.unb64(payload.iv) }, key, U.unb64(payload.ct));
    return JSON.parse(this.dec.decode(pt));
  },
  async unlock(payload, password) {
    const key = await this.deriveKey(password, U.unb64(payload.salt), payload.iter);
    const bank = await this.decrypt(payload, key);
    return { key, bank };
  },
  async exportKey(key) { return U.b64(new Uint8Array(await crypto.subtle.exportKey('raw', key))); },
  async importKey(b64) { return crypto.subtle.importKey('raw', U.unb64(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }
};
