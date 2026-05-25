const levels = { error: 0, warn: 1, info: 2, debug: 3 };

function log(level, message, data) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${message}`, data || '');
}

log.info = (msg, data) => log('info', msg, data);
log.warn = (msg, data) => log('warn', msg, data);
log.error = (msg, data) => log('error', msg, data);
log.debug = (msg, data) => log('debug', msg, data);

export { log };
