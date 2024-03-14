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
  usingPorts: (
    fn: (options: { port1: MRpcPort; port2: MRpcPort }) => Promise<void> | void,
  ) => Promise<void>;
}) {
  const { t, usingPorts } = options;

  async function usingRpcs(
    fn: (options: { rpc1: MRpc; rpc2: MRpc }) => Promise<void> | void,
  ) {
    await usingPorts(async ({ port1, port2 }) => {
      const rpc1 = new MRpc(port1);
      const rpc2 = new MRpc(port2);
      await fn({ rpc1, rpc2 });
      rpc1.dispose();
      rpc1.dispose();
    });
  }

  await t.step("constructor", async (t) => {
    await t.step("new", async () => {
      await usingPorts(({ port1, port2 }) => {
        const rpc1 = new MRpc(port1);
        const rpc2 = new MRpc(port2);
        assertEquals(rpc1.namespace, "#default");
        assertEquals(rpc2.namespace, "#default");
      });
    });

    await t.step("options.namespace", async () => {
      await usingPorts(({ port1, port2 }) => {
        const rpc1 = new MRpc(port1, { namespace: "custom" });
        const rpc2 = new MRpc(port2, { namespace: "custom" });
        assertEquals(rpc1.namespace, "custom");
        assertEquals(rpc2.namespace, "custom");
      });
    });

    await t.step("options.onDisposed", async () => {
      await usingPorts(({ port1, port2 }) => {
        let disposed1 = false;
        let disposed2 = false;

        const rpc1 = new MRpc(port1, {
          onDisposed: () => {
            disposed1 = true;
          },
        });
        const rpc2 = new MRpc(port2, {
          onDisposed: () => {
            disposed2 = true;
          },
        });

        rpc1.dispose();
        rpc2.dispose();
        assertEquals(disposed1, true);
        assertEquals(disposed2, true);
      });
    });
  });

  await t.step("defineLocalFn() & callRemoteFn()", async () => {
    await usingRpcs(async ({ rpc1, rpc2 }) => {
      rpc1.defineLocalFn("add", fns.add);
      rpc1.defineLocalFn("fib", fns.fib);
      assertEquals(await rpc2.callRemoteFn("add", [1, 2]), 3);
      assertEquals(await rpc2.callRemoteFn("fib", [10]), 55);
    });
  });

  await t.step("defineLocalFns() & useRemoteFns()", async () => {
    await usingRpcs(async ({ rpc1, rpc2 }) => {
      rpc1.defineLocalFns(fns);
      const { add: remoteAdd, fib: remoteFib } = rpc2.useRemoteFns<Fns>();
      assertEquals(await remoteAdd(1, 2), 3);
      assertEquals(await remoteFib(10), 55);
    });
  });

  await t.step("useRemoteFn()", async () => {
    await usingRpcs(async ({ rpc1, rpc2 }) => {
      rpc1.defineLocalFn("add", fns.add);
      const remoteAdd = rpc2.useRemoteFn<Fns["add"]>("add");
      assertEquals(await remoteAdd(1, 2), 3);
    });
  });

  await t.step("getLocalFnNames()", async () => {
    await usingRpcs(({ rpc1 }) => {
      rpc1.defineLocalFn("add", fns.add);
      assertEquals(rpc1.getLocalFnNames(), ["add"]);
    });
  });

  await t.step("getRemoteFnNames()", async (t) => {
    await t.step("namespace exists", async () => {
      await usingRpcs(async ({ rpc1, rpc2 }) => {
        rpc1.defineLocalFn("add", fns.add);
        rpc1.defineLocalFn("fib1", fns.fib);
        rpc1.defineLocalFn("fib2", fns.fib);
        assertEquals(await rpc2.getRemoteFnNames(), ["add", "fib1", "fib2"]);
      });
    });

    await t.step("namespace not exists", async () => {
      await usingPorts(async ({ port1, port2 }) => {
        new MRpc(port1);
        const rpc2 = new MRpc(port2, { namespace: "custom" });
        assertEquals(await rpc2.getRemoteFnNames(), undefined);
      });
    });
  });

  await t.step("onDisposed()", async (t) => {
    await t.step("disposed", async () => {
      await usingPorts(({ port1 }) => {
        let disposed1 = false;
        let disposed2 = false;
        const rpc1 = new MRpc(port1);
        rpc1.onDisposed(() => {
          disposed1 = true;
        });
        rpc1.dispose();
        rpc1.onDisposed(() => {
          disposed2 = true;
        });
        assertEquals(disposed1, true);
        assertEquals(disposed2, true);
      });
    });

    await t.step("not disposed", async () => {
      await usingPorts(({ port1 }) => {
        let disposed = false;
        const rpc1 = new MRpc(port1);
        rpc1.onDisposed(() => {
          disposed = true;
        });
        assertEquals(disposed, false);
      });
    });
  });

  await t.step("dispose()", async (t) => {
    await t.step("disposed", async () => {
      await usingPorts(({ port1 }) => {
        const rpc1 = new MRpc(port1, { namespace: "custom" });
        assertEquals(rpc1.disposed, false);
        rpc1.dispose();
        assertEquals(rpc1.disposed, true);
        rpc1.dispose();
        assertEquals(rpc1.disposed, true);
      });
    });

    await t.step("dispose namespace", async () => {
      await usingPorts(({ port1 }) => {
        const rpc1 = new MRpc(port1, { namespace: "custom" });
        rpc1.dispose();
        new MRpc(port1, { namespace: "custom" });
      });
    });
  });

  await t.step("concurrency", async () => {
    await usingRpcs(async ({ rpc1, rpc2 }) => {
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
    });
  });

  await t.step("no undefined name", async () => {
    await usingRpcs(async ({ rpc2 }) => {
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
    });
  });

  await t.step("no conflicting name", async () => {
    await usingRpcs(({ rpc1 }) => {
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
    });
  });

  await t.step("no conflicting namespace", async (t) => {
    await t.step("default namespace", async () => {
      await usingPorts(({ port1 }) => {
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
      });
    });

    await t.step("custom namespace", async () => {
      await usingPorts(({ port1 }) => {
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
      });
    });
  });
}
