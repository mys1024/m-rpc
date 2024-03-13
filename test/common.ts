import { assertEquals, assertIsError } from "@std/assert";
import { MRpc, type MRpcPort } from "../src/main.ts";

/* -------------------------------------------------- local functions -------------------------------------------------- */

const fns = {
  add(a: number, b: number) {
    return a + b;
  },
  fib(n: number): number {
    if (n <= 1) {
      return n;
    }
    return fns.fib(n - 1) + fns.fib(n - 2);
  },
};

type Fns = typeof fns;

/* -------------------------------------------------- tests -------------------------------------------------- */

export async function startCommonTests(options: {
  t: Deno.TestContext;
  ports: () => { port1: MRpcPort; port2: MRpcPort; cleanup?: () => void };
}) {
  const { t, ports } = options;

  function rpcs() {
    const { port1, port2, cleanup } = ports();
    return {
      rpc1: new MRpc(port1),
      rpc2: new MRpc(port2),
      cleanup,
    };
  }

  await t.step("defineLocalFn() & callRemoteFn()", async () => {
    const { rpc1, rpc2, cleanup } = rpcs();

    rpc1.defineLocalFn("add", fns.add);
    rpc1.defineLocalFn("fib", fns.fib);

    assertEquals(await rpc2.callRemoteFn("add", [1, 2]), 3);
    assertEquals(await rpc2.callRemoteFn("fib", [10]), 55);

    cleanup?.();
  });

  await t.step("getLocalFnNames()", () => {
    const { rpc1, cleanup } = rpcs();

    rpc1.defineLocalFn("add", fns.add);
    assertEquals(rpc1.getLocalFnNames(), ["add"]);

    cleanup?.();
  });

  await t.step("useRemoteFn()", async () => {
    const { rpc1, rpc2, cleanup } = rpcs();

    rpc1.defineLocalFn("add", fns.add);
    const remoteAdd = rpc2.useRemoteFn<Fns["add"]>("add");
    assertEquals(await remoteAdd(1, 2), 3);

    cleanup?.();
  });

  await t.step("concurrency", async () => {
    const { rpc1, rpc2, cleanup } = rpcs();

    rpc1.defineLocalFn("add", fns.add);
    rpc1.defineLocalFn("fib", fns.fib);
    const remoteAdd = rpc2.useRemoteFn<Fns["add"]>("add");
    const remoteFib = rpc2.useRemoteFn<Fns["fib"]>("fib");
    const promises = [
      remoteAdd(1, 2),
      remoteAdd(3, 4),
      remoteAdd(5, 6),
      remoteFib(5),
      remoteFib(10),
      remoteFib(15),
    ];
    const results = await Promise.all(promises);
    assertEquals(results, [3, 7, 11, 5, 55, 610]);

    cleanup?.();
  });

  await t.step("useRemoteFns()", async () => {
    const { rpc1, rpc2, cleanup } = rpcs();

    rpc1.defineLocalFn("add", fns.add);
    const remoteFns = rpc2.useRemoteFns<Fns>();
    assertEquals(await remoteFns.add(1, 2), 3);

    cleanup?.();
  });

  await t.step("no undefined name", async () => {
    const { rpc2, cleanup } = rpcs();

    try {
      await rpc2.callRemoteFn("add", [1, 2]);
      throw new Error("Should not reach here.");
    } catch (err) {
      assertIsError(
        err,
        undefined,
        'The remote threw an error when calling function "add": The function name "add" is not defined.',
      );
    }

    cleanup?.();
  });

  await t.step("no conflicting name", () => {
    const { rpc1, cleanup } = rpcs();

    rpc1.defineLocalFn("add", fns.add);
    try {
      rpc1.defineLocalFn("add", fns.add);
      throw new Error("Should not reach here.");
    } catch (err) {
      assertIsError(
        err,
        undefined,
        'The function name "add" has already been defined.',
      );
    }

    cleanup?.();
  });

  await t.step("no conflicting namespace", async (t) => {
    await t.step("default namespace", () => {
      const { port1, cleanup } = ports();

      new MRpc(port1);
      try {
        new MRpc(port1);
        throw new Error("Should not reach here.");
      } catch (err) {
        assertIsError(
          err,
          undefined,
          'The namespace "#default" has already been used by another MRpc instance on this port.',
        );
      }

      cleanup?.();
    });

    await t.step("custom namespace", () => {
      const { port1, cleanup } = ports();

      new MRpc(port1, { namespace: "custom" });
      new MRpc(port1, { namespace: "custom2" });
      try {
        new MRpc(port1, { namespace: "custom2" });
        throw new Error("Should not reach here.");
      } catch (err) {
        assertIsError(
          err,
          undefined,
          'The namespace "custom2" has already been used by another MRpc instance on this port.',
        );
      }

      cleanup?.();
    });

    await t.step("dispose()", () => {
      const { port1, cleanup } = ports();

      const mrpc11 = new MRpc(port1, { namespace: "custom" });
      mrpc11.dispose();
      new MRpc(port1, { namespace: "custom" });

      cleanup?.();
    });
  });
}
