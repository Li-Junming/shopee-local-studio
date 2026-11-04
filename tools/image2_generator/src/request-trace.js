import { AsyncLocalStorage } from "node:async_hooks";
import { channel } from "node:diagnostics_channel";

// Undici's bodySent means the client finished sending the request, NOT that the
// relay/upstream accepted it. Keep that distinction in the event name.
export function traceImageRequest(url, emit) {
  const context = new AsyncLocalStorage();
  const requests = new WeakSet();
  const create = channel("undici:request:create");
  const bodySent = channel("undici:request:bodySent");
  const onCreate = ({ request }) => {
    if (context.getStore() !== true) return;
    try {
      if (new URL(request.path, String(request.origin)).href !== url) return;
      requests.add(request);
      emit("request_created");
    } catch { /* No diagnostic must fail an image job. */ }
  };
  const onBodySent = ({ request }) => {
    if (requests.has(request)) emit("request_body_sent");
  };
  create.subscribe(onCreate);
  bodySent.subscribe(onBodySent);
  return {
    run: (operation) => context.run(true, operation),
    close: () => { create.unsubscribe(onCreate); bodySent.unsubscribe(onBodySent); context.disable(); }
  };
}
