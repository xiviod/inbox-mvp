const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error) {
  if (!error) return true;
  const status = error.response?.status;
  if (!status) return true;
  return status >= 500;
}

async function retry(fn, attempts = 3, delay = 500) {
  try {
    return await fn();
  } catch (err) {
    if (attempts <= 1 || !isRetryable(err)) {
      throw err;
    }
    await wait(delay);
    return retry(fn, attempts - 1, delay * 2);
  }
}

module.exports = {
  retry,
  isRetryable
};

