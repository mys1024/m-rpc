import type {
  AnyFn,
  AwaitedRet,
  MRpcMsgCall,
  MRpcMsgRet,
  MRpcOptions,
  MRpcPort,
  RemoteFn,
  RemoteFns,
  RemoteRet,
} from "./types.ts";
import { isMRpcMsgCall, isMRpcMsgRet } from "./utils.ts";

/* -------------------------------------------------- types -------------------------------------------------- */

interface LocalFnInfo {
  fn: AnyFn;
}

interface RemoteCallInfo {
  resolve: (ret: any) => void;
  reject: (err: any) => void;
}

interface PortStates {
  namespaces: Map<string, MRpc>; // namespace -> mrpc
}

type InternalFns = {
  names: (namespace: string) => string[] | undefined;
};

/* -------------------------------------------------- constants -------------------------------------------------- */

const NAMESPACE_DEFAULT = "#default";
const NAMESPACE_INTERNAL = "#internal";

/* -------------------------------------------------- mrpc -------------------------------------------------- */

export class MRpc {
  /* -------------------------------------------------- properties -------------------------------------------------- */

  #port: MRpcPort;
  #stopListening?: () => void;
  #localFns = new Map<string, LocalFnInfo>(); // name -> localFnInfo
  #remoteCalls = new Map<number, RemoteCallInfo>(); // key -> remoteCallInfo
  #callAcc = 0; // call accumulator
  #onDisposedCallbacks = new Set<() => void>();
  #namespace: string;
  #disposed = false;

  get namespace() {
    return this.#namespace;
  }

  get disposed() {
    return this.#disposed;
  }

  /* -------------------------------------------------- constructor -------------------------------------------------- */

  constructor(port: MRpcPort, options: MRpcOptions = {}) {
    // destructure the options
    const { namespace = NAMESPACE_DEFAULT, onDisposed } = options;

    // init properties
    this.#namespace = namespace;
    this.#port = port;

    // add the onDisposed callback
    if (onDisposed) {
      this.#onDisposedCallbacks.add(onDisposed);
    }

    // init the port
    this.#initPort(port, namespace);
  }

  /* -------------------------------------------------- public methods -------------------------------------------------- */

  /**
   * Define a local function.
   */
  defineLocalFn(
    name: string,
    fn: AnyFn,
  ): void {
    if (this.#localFns.has(name)) {
      throw new Error(`The function name "${name}" has already been defined.`);
    }
    this.#localFns.set(name, { fn });
  }

  /**
   * Define local functions.
   */
  defineLocalFns(fns: Record<string, AnyFn>): void {
    for (const [name, fn] of Object.entries(fns)) {
      this.defineLocalFn(name, fn);
    }
  }

  /**
   * Call a remote function.
   */
  callRemoteFn<FN extends AnyFn>(
    name: string,
    args: Parameters<FN>,
  ): RemoteRet<FN> {
    // save the info of the call
    const key = ++this.#callAcc;
    const ret = new Promise<AwaitedRet<FN>>((resolve, reject) => {
      this.#remoteCalls.set(key, { resolve, reject });
    });

    // send a call message
    this.#sendCallMsg(name, key, args);

    // return a promise that resolves the return value of the remote function
    return ret;
  }

  /**
   * Use a remote function.
   */
  useRemoteFn<FN extends AnyFn>(
    name: string,
  ): RemoteFn<FN> {
    return (...args: Parameters<FN>) => this.callRemoteFn(name, args);
  }

  /**
   * Use remote functions.
   */
  useRemoteFns<FNS extends Record<string, AnyFn>>(): RemoteFns<FNS> {
    const fns = new Proxy({} as RemoteFns<FNS>, {
      get: (target, name) => {
        if (typeof name !== "string") {
          throw new Error(`The name is not a string.`, { cause: name });
        }
        if (target[name]) {
          return target[name];
        }
        const fn = this.useRemoteFn(name);
        (target as any)[name] = fn;
        return fn;
      },
    });
    return fns;
  }

  /**
   * Get the names of the local functions.
   */
  getLocalFnNames(): string[] {
    return Array.from(this.#localFns.keys());
  }

  /**
   * Get the names of the remote functions.
   */
  getRemoteFnNames(): Promise<string[] | undefined> {
    const internalMrpc = this.#ensureInternalMRpc();
    return internalMrpc.callRemoteFn<InternalFns["names"]>("names", [
      this.#namespace,
    ]);
  }

  /**
   * Dispose the MRpc instance. The port won't be stopped.
   */
  dispose() {
    // check if already disposed
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    // stop listening
    this.#stopListening?.();

    // delete the namespace from the port
    MRpc.#deletePortNamespace(this.#port, this.#namespace);

    // call the onDisposed callbacks
    for (const cb of this.#onDisposedCallbacks) {
      cb();
    }
  }

  /* -------------------------------------------------- private methods -------------------------------------------------- */

  #sendCallMsg(name: string, key: number, args: any[]) {
    const msg: MRpcMsgCall = {
      type: "call",
      ns: this.#namespace,
      key,
      name,
      args,
    };
    this.#port.postMessage(msg);
  }

  #sendReturnMsg(
    name: string,
    key: number,
    ok: boolean,
    ret: any,
    err: string | undefined,
  ) {
    const msg: MRpcMsgRet = {
      type: "ret",
      ns: this.#namespace,
      name,
      key,
      ok,
      ret,
      err: err as any,
    };
    this.#port.postMessage(msg);
  }

  #ensureInternalMRpc() {
    return MRpc.ensureMRpc(this.#port, NAMESPACE_INTERNAL);
  }

  #initPort(port: MRpcPort, namespace: string) {
    // add the namespace to the port
    MRpc.#addPortNamespace(port, namespace, this);

    // ensure internal MRpc
    this.#ensureInternalMRpc();

    // define internal functions
    if (namespace === NAMESPACE_INTERNAL) {
      const internalFns: InternalFns = {
        names: (namespace: string) =>
          MRpc.getMRpc(port, namespace)?.getLocalFnNames(),
      };
      this.defineLocalFns(internalFns);
    }

    // start listening
    port.start();
    this.#startListening(port);
  }

  #startListening(port: MRpcPort) {
    const listener = async (event: MessageEvent) => {
      if (isMRpcMsgCall(event.data)) {
        // destructure the call message
        const { ns, name, key, args } = event.data;

        // check the namespace
        if (ns !== this.#namespace) {
          return;
        }

        // get the local function
        const localFnInfo = this.#localFns.get(name);
        if (!localFnInfo) {
          const errMsg = `The function name "${name}" is not defined.`;
          this.#sendReturnMsg(name, key, false, undefined, errMsg);
          return;
        }
        const { fn } = localFnInfo;

        // invoke the local function
        try {
          const ret = await fn(...args);
          this.#sendReturnMsg(name, key, true, ret, undefined);
        } catch (err) {
          const errMsg = err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : String(err);
          this.#sendReturnMsg(name, key, false, undefined, errMsg);
        }
      } else if (isMRpcMsgRet(event.data)) {
        // destructure the return message
        const { ns, name, key, ok, ret, err } = event.data;

        // check the namespace
        if (ns !== this.#namespace) {
          return;
        }

        // get the promise resolvers
        const remoteCallInfo = this.#remoteCalls.get(key);
        if (!remoteCallInfo) {
          return;
        }

        // resolve the promise
        const { resolve, reject } = remoteCallInfo;
        if (ok) {
          resolve(ret);
        } else {
          reject(
            new Error(
              `The remote threw an error when calling function "${name}": ${err}`,
            ),
          );
        }

        // cleanup
        this.#remoteCalls.delete(key);
      }
    };

    port.addEventListener("message", listener);
    this.#stopListening = () => port.removeEventListener("message", listener);
  }

  /* -------------------------------------------------- static -------------------------------------------------- */

  static #ports = new WeakMap<MRpcPort, PortStates>();

  static ensureMRpc(
    port: MRpcPort,
    namespace: string = NAMESPACE_DEFAULT,
  ): MRpc {
    return MRpc.getMRpc(port, namespace) || new MRpc(port, { namespace });
  }

  static getMRpc(
    port: MRpcPort,
    namespace: string = NAMESPACE_DEFAULT,
  ): MRpc | undefined {
    return MRpc.#ensurePortStates(port).namespaces.get(namespace);
  }

  static #addPortNamespace(port: MRpcPort, namespace: string, mrpc: MRpc) {
    const { namespaces } = MRpc.#ensurePortStates(port);
    if (namespaces.has(namespace)) {
      throw new Error(
        `The namespace "${namespace}" has already been used by another MRpc instance on this port.`,
      );
    }
    namespaces.set(namespace, mrpc);
  }

  static #deletePortNamespace(port: MRpcPort, namespace: string) {
    const { namespaces } = MRpc.#ensurePortStates(port);
    namespaces.delete(namespace);
  }

  static #ensurePortStates(port: MRpcPort): PortStates {
    let states = MRpc.#ports.get(port);
    if (!states) {
      states = {
        namespaces: new Map(),
      };
      MRpc.#ports.set(port, states);
    }
    return states;
  }
}
