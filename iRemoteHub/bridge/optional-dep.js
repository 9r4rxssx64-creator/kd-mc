// Charge une dépendance optionnelle avec message d'erreur clair si absente
function requireOptional(name, hint) {
  try { return require(name); }
  catch (e) {
    return new Proxy({}, {
      get() {
        throw new Error('Dépendance optionnelle "' + name + '" non installée. ' + (hint || 'Lance : npm install ' + name));
      }
    });
  }
}

module.exports = { requireOptional };
