// Pure worker protocol: maps a request message to a response + transferables list.
// No DOM, no Worker, no I/O — usable from both the worker shell and tests.

import { runGenerate, type GenerateRequest } from './generate.js';
import { collectTransferables, type WorldState } from './state.js';

export type RequestMessage =
  | { readonly type: 'generate'; readonly request: GenerateRequest };

export type ResponseMessage =
  | { readonly type: 'generated'; readonly state: WorldState }
  | { readonly type: 'error'; readonly message: string };

export interface HandledResponse {
  readonly response: ResponseMessage;
  readonly transfer: ArrayBuffer[];
}

export function handleRequest(msg: RequestMessage): HandledResponse {
  try {
    switch (msg.type) {
      case 'generate': {
        const state = runGenerate(msg.request);
        return {
          response: { type: 'generated', state },
          transfer: collectTransferables(state),
        };
      }
    }
  } catch (err) {
    return {
      response: {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      },
      transfer: [],
    };
  }
}
