// auth.js — utilitaires d'authentification PWA/Bridge
const crypto = require('crypto');

module.exports = {
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  },

  verifyToken(provided, expected) {
    if (!provided || !expected) return false;
    // Comparaison temps constant
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
};
