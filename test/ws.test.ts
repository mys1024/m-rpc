import { Application as OakApplication } from "@oak/oak";
import { startCommonTests } from "./common.test.ts";

Deno.test("WebSocket", async (t) => {
  let serverPortAcc = 30000;

  await startCommonTests({
    t,
    usingPorts: async (fn) => {
      const serverPort = serverPortAcc++;

      const ws1Promise = new Promise<
        { ws1: WebSocket; shutdownServer: () => void }
      >(
        (resolve) => {
          const controller = new AbortController();
          const { signal } = controller;
          new OakApplication()
            .use((ctx) => {
              const ws = ctx.upgrade();
              ws.onopen = () => {
                resolve({
                  ws1: ws,
                  shutdownServer: () => {
                    controller.abort();
                  },
                });
              };
            })
            .listen({ port: serverPort, signal });
        },
      );

      const ws2 = await new Promise<WebSocket>((resolve) => {
        const ws2 = new WebSocket(`ws://127.0.0.1:${serverPort}`);
        ws2.onopen = () => {
          resolve(ws2);
        };
      });
      const { ws1, shutdownServer } = await ws1Promise;

      await fn({ port1: ws1, port2: ws2 });

      ws1.close();
      ws2.close();
      shutdownServer();
    },
  });
});
