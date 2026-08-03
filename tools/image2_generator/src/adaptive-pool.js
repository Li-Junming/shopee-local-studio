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
  const onDowngrade = options?.onDowngrade || (() => {});
  const onRequeue = options?.onRequeue || (() => {});
  const queue = Array.from(items, (item) => ({ item, fallbackRetried: false }));

  return new Promise((resolve, reject) => {
    let concurrency = maxConcurrency;
    let active = 0;
    let fatalError = null;
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
        resolve();
        return;
      }

      while (queue.length > 0 && active < concurrency) {
        const entry = queue.shift();
        active += 1;
        Promise.resolve()
          .then(() => worker(entry.item))
          .then(() => {
            active -= 1;
            schedule();
          }, (error) => {
            active -= 1;
            if (isRetryable(error) && !entry.fallbackRetried) {
              entry.fallbackRetried = true;
              const previousConcurrency = concurrency;
              concurrency = fallbackConcurrency;
              if (concurrency < previousConcurrency) {
                onDowngrade({ from: previousConcurrency, to: concurrency, error });
              }
              onRequeue({ item: entry.item, error });
              queue.unshift(entry);
            } else {
              fatalError = error;
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
