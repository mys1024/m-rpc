import { MsgPortNormalized } from "../src/types.ts";
import { startCommonTests } from "./common.test.ts";

Deno.test("MsgPortNormalized", async (t) => {
  await startCommonTests({
    t,
    usingPorts: async (fn) => {
      // deno-lint-ignore prefer-const
      let port1: MsgPortNormalized & {
        _listeners: Set<(event: MessageEvent) => void>;
      };
      // deno-lint-ignore prefer-const
      let port2: MsgPortNormalized & {
        _listeners: Set<(event: MessageEvent) => void>;
      };

      port1 = {
        _listeners: new Set(),
        postMessage: (message: any) => {
          port2._listeners.forEach((listener) =>
            listener({ data: message } as MessageEvent)
          );
        },
        addEventListener: (_type, listener) => {
          port1._listeners.add(listener);
        },
        removeEventListener: (_type, listener) => {
          port1._listeners.delete(listener);
        },
      };
      port2 = {
        _listeners: new Set(),
        postMessage: (message: any) => {
          port1._listeners.forEach((listener) =>
            listener({ data: message } as MessageEvent)
          );
        },
        addEventListener: (_type, listener) => {
          port2._listeners.add(listener);
        },
        removeEventListener: (_type, listener) => {
          port2._listeners.delete(listener);
        },
      };

      await fn({ port1, port2 });
    },
  });
});
