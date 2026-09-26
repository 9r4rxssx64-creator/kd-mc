// Logger structuré coloré (ANSI) avec niveaux + child loggers
const COLORS = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', ok: '\x1b[32m', debug: '\x1b[90m', reset: '\x1b[0m' };
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

function ts() { return new Date().toISOString(); }

function log(level, module, msg, extra) {
  const color = COLORS[level] || '';
  const reset = COLORS.reset;
  const line = `${color}[${ts()}] [${module}] ${level.toUpperCase()}: ${msg}${reset}`;
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
  if (extra) console.log(extra);
}

module.exports = {
  info: (m, msg, extra) => log('info', m, msg, extra),
  warn: (m, msg, extra) => log('warn', m, msg, extra),
  error: (m, msg, extra) => log('error', m, msg, extra),
  ok: (m, msg, extra) => log('ok', m, msg, extra),
  debug: (m, msg, extra) => DEBUG && log('debug', m, msg, extra),
  child(module) {
    return {
      info: (msg, extra) => log('info', module, msg, extra),
      warn: (msg, extra) => log('warn', module, msg, extra),
      error: (msg, extra) => log('error', module, msg, extra),
      ok: (msg, extra) => log('ok', module, msg, extra),
      debug: (msg, extra) => DEBUG && log('debug', module, msg, extra)
    };
  }
};
