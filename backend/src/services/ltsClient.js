const axios = require('axios');
const config = require('../config');

let isEnabled = Boolean(
  config.lts.enabled &&
    config.lts.endpoint &&
    config.lts.projectId &&
    config.lts.logGroup &&
    config.lts.logStream
);

async function pushLog(entry) {
  if (!isEnabled) return;

  try {
    await axios.post(
      `${config.lts.endpoint}/v2/${config.lts.projectId}/groups/${config.lts.logGroup}/streams/${config.lts.logStream}/content`,
      {
        log_stream_name: config.lts.logStream,
        log_group_id: config.lts.logGroup,
        logs: [
          {
            time: Date.now() * 1000,
            contents: Object.entries(entry).map(([key, value]) => ({
              key,
              value: typeof value === 'string' ? value : JSON.stringify(value)
            }))
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': config.lts.projectId,
          'X-Access-Key': config.lts.accessKey,
          'X-Secret-Key': config.lts.secretKey
        },
        timeout: 5000
      }
    );
  } catch (error) {
    // Best-effort logging; do not throw.
    console.error('[lts] failed to push log', error.message);
    isEnabled = false;
  }
}

module.exports = {
  pushLog
};

