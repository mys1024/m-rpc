import { startCommonTests } from "./common.test.ts";

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
