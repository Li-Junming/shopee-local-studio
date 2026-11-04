import { isRetryableImageError, safeImageError } from "../../image2_generator/src/image2-client.js";

export const DEFAULT_IMAGE_NO_PROGRESS_LIMIT = 2;

export function imageProcessFailure(stderr, exitCode) {
  const text = safeImageError(stderr);
  const terminal = /IMAGE_QUEUE_EXHAUSTED|IMAGE_QUEUE_BLOCKED/.test(text);
  const relayBlocked = /IMAGE_RELAY_UPSTREAM_TIMEOUT/.test(text);
  const uncertain = /IMAGE_API_EXECUTION_UNCERTAIN/.test(text);
  const message = text.match(/\[error\]\s*(?:Error:\s*)?([^\r\n]+)/)?.[1]
    || text.split(/\r?\n/).findLast((line) => /\[image2\] failed/.test(line))
    || "Image process stopped without request diagnostics";
  const error = new Error(`image2 failed with exit ${exitCode}: ${message.slice(0, 1600)}`);
  error.retryable = !terminal && !relayBlocked && !uncertain && isRetryableImageError(new Error(text));
  error.code = uncertain ? "IMAGE_API_EXECUTION_UNCERTAIN" : relayBlocked ? "IMAGE_RELAY_UPSTREAM_TIMEOUT" : terminal ? "IMAGE_QUEUE_EXHAUSTED"
    : /tls handshake eof/i.test(text) ? "IMAGE_UPSTREAM_TLS_ERROR" : "IMAGE_PROCESS_FAILED";
  return error;
}

export function imageRecoveryDelay(routeCount, baseDelayMs, noProgressRounds) {
  // A genuinely separate backup should be tried immediately. On one route,
  // back off instead of flooding an upstream that already retries internally.
  if (routeCount > 1) return 0;
  return Math.min(120000, baseDelayMs * 2 ** Math.max(0, noProgressRounds - 1));
}
