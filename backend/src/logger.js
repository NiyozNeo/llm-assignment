const fs = require('fs');
const path = require('path');

const LOG_TO_FILE = true;
const logsDir = path.join(__dirname, '..', 'logs');
try {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
} catch (e) {
  console.error('Failed to create logs directory', e);
}
const logFile = path.join(logsDir, 'server.log');

function writeLine(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  const line = `${timestamp} [${level}] ${message}${metaStr}`;
  if (level === 'ERROR') console.error(line);
  else console.log(line);
  if (LOG_TO_FILE) {
    try {
      fs.appendFile(logFile, line + '\n', (err) => {
        if (err) console.error('Failed to write to log file', err);
      });
    } catch (e) {
      console.error('Failed to append log', e);
    }
  }
}

module.exports = {
  info: (m, meta) => writeLine('INFO', m, meta),
  warn: (m, meta) => writeLine('WARN', m, meta),
  error: (m, meta) => writeLine('ERROR', m, meta),
  debug: (m, meta) => writeLine('DEBUG', m, meta),
  logsDir,
};
