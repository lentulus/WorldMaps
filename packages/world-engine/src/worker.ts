// Browser Web Worker shell. Studio imports this via `?worker` in Phase 4.
// All logic lives in `worker-protocol.ts`; this file just wires postMessage.

/// <reference lib="webworker" />

import { handleRequest, type RequestMessage } from './worker-protocol.js';

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', (event: MessageEvent<RequestMessage>) => {
  const { response, transfer } = handleRequest(event.data);
  self.postMessage(response, { transfer });
});
