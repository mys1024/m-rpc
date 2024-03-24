import type {
  AnyFn,
  AwaitedRet,
  MRpcCallOptions,
  MRpcMsgCall,
  MRpcMsgPort,
  MRpcMsgRet,
  MRpcOptions,
  RemoteFn,
  RemoteFns,
  RemoteRet,
} from "./types.ts";
import { isMRpcMsgCall, isMRpcMsgRet } from "./utils.ts";
import { onMsg, sendMsg } from "./ports.ts";

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
  $names: (namespace: string) => string[] | undefined;
};

/* -------------------------------------------------- constants -------------------------------------------------- */

const NAMESPACE_DEFAULT = "default";
const NAMESPACE_INTERNAL = "#internal";

/* -------------------------------------------------- mrpc -------------------------------------------------- */

/**
 * The agent for message based remote procedure call.
 */
export class MRpc {
  /* -------------------------------------------------- properties -------------------------------------------------- */

  #port: MRpcMsgPort;
  #namespace: string;
  #timeout: number;
  #retry: number;
  #localFns = new Map<string, LocalFnInfo>(); // name -> localFnInfo
  #remoteCalls = new Map<number, RemoteCallInfo>(); // key -> remoteCallInfo
  #onDisposedCallbacks = new Set<() => void>();
  #callAcc = 0; // call accumulator
  #disposed = false;

  get namespace(): string {
    return this.#namespace;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /* -------------------------------------------------- constructor -------------------------------------------------- */

  constructor(port: MRpcMsgPort, options: MRpcOptions = {}) {
    // options
    const {
      namespace = NAMESPACE_DEFAULT,
      timeout = 3000,
      retry = 0,
      onDisposed,
    } = options;

    // init properties
    this.#port = port;
    this.#namespace = namespace;
    this.#timeout = timeout;
    this.#retry = retry;
    if (onDisposed) {
      this.onDisposed(onDisposed);
    }

    // init the instance
    this.#init();
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
    options: MRpcCallOptions = {},
  ): RemoteRet<FN> {
    // options
    const {
      timeout = this.#timeout,
      retry = this.#retry,
    } = options;

    // generate a key for the call
    const key = ++this.#callAcc;

    // the return value of the remote function
    const ret = new Promise<AwaitedRet<FN>>((resolve, reject) => {
      // set a timeout
      const timeoutId = setTimeout(() => {
        // cleanup
        this.#remoteCalls.delete(key);
        // retry
        if (retry > 0) {
          this.callRemoteFn(name, args, {
            ...options,
            retry: retry - 1,
          }).then(resolve, reject);
        } else {
          reject(
            new Error(`The call of the remote function "${name}" timed out.`),
          );
        }
      }, timeout);
      // save the info of the call
      this.#remoteCalls.set(key, {
        resolve: (ret) => {
          clearTimeout(timeoutId);
          resolve(ret);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });
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
    options?: MRpcCallOptions,
  ): RemoteFn<FN> {
    return (...args: Parameters<FN>) => this.callRemoteFn(name, args, options);
  }

  /**
   * Use remote functions.
   */
  useRemoteFns<FNS extends Record<string, AnyFn>>(
    options?: {
      [K in keyof FNS]?: MRpcCallOptions;
    },
  ): RemoteFns<FNS> {
    const fns = new Proxy({} as RemoteFns<FNS>, {
      get: (target, name) => {
        if (typeof name !== "string") {
          throw new Error(`The name is not a string.`, { cause: name });
        }
        if (target[name]) {
          return target[name];
        }
        const fn = this.useRemoteFn(name, options?.[name]);
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
    return internalMrpc.callRemoteFn<InternalFns["$names"]>("$names", [
      this.#namespace,
    ]);
  }

  /**
   * Add an onDisposed callback.
   */
  onDisposed(cb: () => void) {
    if (this.#disposed) {
      cb();
    }
    this.#onDisposedCallbacks.add(cb);
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

    // delete the namespace from the port
    MRpc.#deletePortNamespace(this.#port, this.#namespace);

    // call the onDisposed callbacks
    for (const cb of this.#onDisposedCallbacks) {
      cb();
    }

    // clear the onDisposed callbacks
    this.#onDisposedCallbacks.clear();
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
    sendMsg(this.#port, msg);
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
    sendMsg(this.#port, msg);
  }

  #ensureInternalMRpc() {
    return MRpc.ensureMRpc(this.#port, NAMESPACE_INTERNAL);
  }

  #init() {
    // add the namespace to the port
    MRpc.#addPortNamespace(this.#port, this.#namespace, this);

    // ensure internal MRpc
    this.#ensureInternalMRpc();

    // define internal functions if the namespace is internal
    if (this.#namespace === NAMESPACE_INTERNAL) {
      const internalFns: InternalFns = {
        $names: (namespace: string) =>
          MRpc.getMRpc(this.#port, namespace)?.getLocalFnNames(),
      };
      this.defineLocalFns(internalFns);
    }

    // start listening
    this.#startListening();
  }

  #startListening() {
    // the listener
    const listener = async (msg: MRpcMsgCall | MRpcMsgRet) => {
      if (isMRpcMsgCall(msg)) {
        // destructure the call message
        const { ns, name, key, args } = msg;

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
      } else if (isMRpcMsgRet(msg)) {
        // destructure the return message
        const { ns, name, key, ok, ret, err } = msg;

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
              `The remote threw an error when calling the function "${name}": ${err}`,
            ),
          );
        }

        // cleanup
        this.#remoteCalls.delete(key);
      } else {
        throw new Error(`Invalid message type.`, { cause: msg });
      }
    };

    // start listening
    const { stop } = onMsg(this.#port, listener);

    // stop listening when disposed
    this.onDisposed(() => {
      stop();
    });
  }

  /* -------------------------------------------------- static -------------------------------------------------- */

  static #ports = new WeakMap<MRpcMsgPort, PortStates>();

  static ensureMRpc(
    port: MRpcMsgPort,
    namespace: string = NAMESPACE_DEFAULT,
  ): MRpc {
    return MRpc.getMRpc(port, namespace) || new MRpc(port, { namespace });
  }

  static getMRpc(
    port: MRpcMsgPort,
    namespace: string = NAMESPACE_DEFAULT,
  ): MRpc | undefined {
    return MRpc.#ensurePortStates(port).namespaces.get(namespace);
  }

  static #addPortNamespace(port: MRpcMsgPort, namespace: string, mrpc: MRpc) {
    const { namespaces } = MRpc.#ensurePortStates(port);
    if (namespaces.has(namespace)) {
      throw new Error(
        `The namespace "${namespace}" has already been used by another MRpc instance on this port.`,
      );
    }
    namespaces.set(namespace, mrpc);
  }

  static #deletePortNamespace(port: MRpcMsgPort, namespace: string) {
    const { namespaces } = MRpc.#ensurePortStates(port);
    namespaces.delete(namespace);
  }

  static #ensurePortStates(port: MRpcMsgPort): PortStates {
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
