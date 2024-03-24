import { MRpcMsgPortCommon } from "../src/main.ts";
import { startCommonTests } from "./ports.common.test.ts";

Deno.test("MessagePort", async (t) => {
  await startCommonTests({
    t,
    usingPorts: async (fn) => {
      const { port1, port2 } = new MessageChannel();
      port1.start();
      port2.start();
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

Deno.test("Worker", async (t) => {
  await startCommonTests({
    t,
    usingPorts: async (fn) => {
      const worker = new Worker(
        new URL("./ports.worker.ts", import.meta.url),
        { type: "module" },
      );

      const workerGlobalProxy = await new Promise<MessagePort>((resolve) => {
        const initListener = (event: MessageEvent) => {
          const { workerGlobalProxy } = event.data;
          if (workerGlobalProxy instanceof MessagePort) {
            resolve(workerGlobalProxy);
            worker.removeEventListener("message", initListener);
          }
        };
        worker.addEventListener("message", initListener);
      });
      workerGlobalProxy.start();

      await fn({ port1: worker, port2: workerGlobalProxy });

      workerGlobalProxy.close();
      worker.terminate();
    },
  });
});

Deno.test("MRpcMsgPortCommon", async (t) => {
  await startCommonTests({
    t,
    usingPorts: async (fn) => {
      const listeners1 = new Set<(e: MessageEvent) => void>();
      const listeners2 = new Set<(e: MessageEvent) => void>();

      const port1 = new MRpcMsgPortCommon({
        postMessage: (message: any) => {
          listeners2.forEach((listener) =>
            listener(new MessageEvent("message", { data: message }))
          );
        },
        addEventListener: (_type, listener) => {
          listeners1.add(listener);
        },
        removeEventListener: (_type, listener) => {
          listeners1.delete(listener);
        },
      });
      const port2 = new MRpcMsgPortCommon({
        postMessage: (message: any) => {
          listeners1.forEach((listener) =>
            listener(new MessageEvent("message", { data: message }))
          );
        },
        addEventListener: (_type, listener) => {
          listeners2.add(listener);
        },
        removeEventListener: (_type, listener) => {
          listeners2.delete(listener);
        },
      });

      await fn({ port1, port2 });
    },
  });
});
