import { assertEquals } from "@std/assert";
import { MRpc } from "./main.ts";

Deno.test("example test", async () => {
  function add(a: number, b: number) {
    return a + b;
  }

  type Add = typeof add;
  type Fns = {
    add: Add;
  };

  const { port1, port2 } = new MessageChannel();
  const rpc1 = new MRpc(port1);
  const rpc2 = new MRpc(port2);

  // defineLocalFn
  rpc1.defineLocalFn("add", add);
  assertEquals(rpc1.getLocalFnNames(), ["add"]);

  // callRemoteFn
  const ret = await rpc2.callRemoteFn<Add>("add", [1, 2]);
  assertEquals(ret, 3);

  // useRemoteFn
  const addRemote = rpc2.useRemoteFn<Add>("add");
  assertEquals(await addRemote(1, 2), 3);

  // useRemoteFns
  const remoteFns = rpc2.useRemoteFns<Fns>();
  assertEquals(await remoteFns.add(1, 2), 3);

  // cleanup
  port1.close();
  port2.close();
});
