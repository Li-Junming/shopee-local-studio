export function runAdaptivePool(items, options, worker) {
  if (typeof worker !== "function") {
    throw new TypeError("worker must be a function");
  }

  const maxConcurrency = positiveInteger(options?.maxConcurrency, "maxConcurrency");
  const fallbackConcurrency = Math.min(
    maxConcurrency,
    positiveInteger(options?.fallbackConcurrency, "fallbackConcurrency")
  );
  const isRetryable = options?.isRetryable || (() => false);
  const isFatal = options?.isFatal || (() => false);
  const onDowngrade = options?.onDowngrade || (() => {});
  const onRequeue = options?.onRequeue || (() => {});
  const onFailure = options?.onFailure || (() => {});
  const continueOnError = Boolean(options?.continueOnError);
  const maxRetryableFailures = optionalPositiveInteger(options?.maxRetryableFailures, "maxRetryableFailures");
  const queue = Array.from(items, (item) => ({ item, fallbackRetried: false }));
  const failures = [];

  return new Promise((resolve, reject) => {
    let concurrency = maxConcurrency;
    let active = 0;
    let fatalError = null;
    let consecutiveRetryableFailures = 0;
    let settled = false;

    const schedule = () => {
      if (settled) return;
      if (fatalError) {
        if (active === 0) {
          settled = true;
          reject(fatalError);
        }
        return;
      }
      if (queue.length === 0 && active === 0) {
        settled = true;
        resolve({ failures });
        return;
      }

      while (queue.length > 0 && active < concurrency) {
        const entry = queue.shift();
        active += 1;
        Promise.resolve()
          .then(() => worker(entry.item))
          .then(() => {
            active -= 1;
            // A successful image proves that the upstream route recovered.
            // Only consecutive transient failures should trip the circuit.
            consecutiveRetryableFailures = 0;
            schedule();
          }, (error) => {
            active -= 1;
            // Stop dispatching queued work on account-wide failures. Let already
            // active work settle without hiding the original authentication error.
            if (fatalError || isFatal(error)) {
              fatalError ??= error;
              failures.push({ item: entry.item, error });
              onFailure({ item: entry.item, error });
              schedule();
              return;
            }
            const retryable = isRetryable(error);
            if (retryable) {
              consecutiveRetryableFailures += 1;
              if (maxRetryableFailures && consecutiveRetryableFailures >= maxRetryableFailures) {
                failures.push({ item: entry.item, error });
                onFailure({ item: entry.item, error });
                fatalError = new Error(`Too many consecutive retryable failures (${consecutiveRetryableFailures}); image API appears unstable. Last error: ${error.message}`);
                schedule();
                return;
              }
            }
            if (retryable && !entry.fallbackRetried) {
              entry.fallbackRetried = true;
              const previousConcurrency = concurrency;
              concurrency = fallbackConcurrency;
              if (concurrency < previousConcurrency) {
                onDowngrade({ from: previousConcurrency, to: concurrency, error });
              }
              onRequeue({ item: entry.item, error });
              // Move a stalled image behind untouched work. This avoids spending
              // several consecutive timeout windows on the same output.
              queue.push(entry);
            } else {
              failures.push({ item: entry.item, error });
              onFailure({ item: entry.item, error });
              if (!continueOnError) fatalError = error;
            }
            schedule();
          });
      }
    };

    schedule();
  });
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`${name} must be an integer >= 1`);
  }
  return number;
}

function optionalPositiveInteger(value, name) {
  if (value === undefined || value === null || value === "") return 0;
  return positiveInteger(value, name);
}
