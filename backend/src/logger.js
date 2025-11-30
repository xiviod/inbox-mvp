const fs = require('fs');
const path = require('path');
const config = require('./config');

fs.mkdirSync(config.loggingDir, { recursive: true });

const logFilePath = path.join(config.loggingDir, 'app.log');

function log(event, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...details
  };

  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFile(logFilePath, `${line}\n`, (err) => {
    if (err) {
      console.error('Failed to write log file entry', err);
    }
  });
}

function getRecentLogs(limit = 50) {
  if (!fs.existsSync(logFilePath)) {
    return [];
  }

  const lines = fs.readFileSync(logFilePath, 'utf-8').trim().split('\n');
  const recent = lines.slice(-limit);
  return recent.map((line) => {
    try {
      return JSON.parse(line);
    } catch (_) {
      return { ts: null, event: 'parse_error', raw: line };
    }
  });
}

module.exports = {
  log,
  getRecentLogs,
  logFilePath
};

