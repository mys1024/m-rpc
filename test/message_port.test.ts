import { startCommonTests } from "./common.ts";

Deno.test("MessagePort", async (t) => {
  await startCommonTests({
    t,
    ports: () => {
      const { port1, port2 } = new MessageChannel();
      return {
        port1,
        port2,
        cleanup: () => {
          port1.close();
          port2.close();
        },
      };
    },
  });
});
