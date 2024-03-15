import { MsgPortNormalized } from "../src/types.ts";
import { startCommonTests } from "./ports.common.test.ts";

Deno.test("MessagePort", async (t) => {
  await startCommonTests({
    t,
    usingPorts: async (fn) => {
      const { port1, port2 } = new MessageChannel();

      await fn({ port1, port2 });

      port1.close();
      port2.close();
    },
  });
});

Deno.test("WebSocket", async (t) => {
  const serverPort = 35999;
  let onServerWsOpen: ((ws: WebSocket) => void) | undefined;

  const server = Deno.serve({ port: serverPort }, (req) => {
    const { response, socket } = Deno.upgradeWebSocket(req);
    onServerWsOpen?.(socket);
    return response;
  });

  async function usingWss(
    fn: (ws1: WebSocket, ws2: WebSocket) => Promise<void>,
  ) {
    const _ws1 = new Promise<WebSocket>((resolve) => {
      onServerWsOpen = (ws) => {
        ws.onopen = () => {
          resolve(ws);
        };
      };
    });
    const _ws2 = new Promise<WebSocket>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`);
      ws.onopen = () => {
        resolve(ws);
      };
    });
    const [ws1, ws2] = await Promise.all([_ws1, _ws2]);
    await fn(ws1, ws2);
    ws1.close();
    ws2.close();
  }

  await startCommonTests({
    t,
    usingPorts: async (fn) => {
      await usingWss(async (ws1, ws2) => {
        await fn({ port1: ws1, port2: ws2 });
      });
    },
  });

  server.shutdown();
});

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