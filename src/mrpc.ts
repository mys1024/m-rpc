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

interface MsgPortWithStates {
  _mrpc?: {
    mrpcs: Map<string, MRpc>; // namespace -> mrpc
  };
}

/* -------------------------------------------------- constants -------------------------------------------------- */

const DEFAULT_NAMESPACE = "#default";

/* -------------------------------------------------- mrpc -------------------------------------------------- */

export class MRpc {
  #port: MRpcPort;
  #stopListening?: () => void;
  #localFns = new Map<string, LocalFnInfo>(); // name -> localFnInfo
  #remoteCalls = new Map<number, RemoteCallInfo>(); // key -> remoteCallInfo
  #callAcc = 0; // call accumulator

  readonly namespace: string;

  constructor(port: MRpcPort, options: MRpcOptions = {}) {
    // destructure the options
    const { namespace = DEFAULT_NAMESPACE } = options;

    // properties
    this.namespace = namespace;
    this.#port = port;

    // init the port
    this.#initPort(port, namespace);
  }

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
   * Get the names of the local functions.
   */
  getLocalFnNames(): string[] {
    return Array.from(this.#localFns.keys());
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
   * Dispose the MRpc instance. The port won't be stopped.
   */
  dispose() {
    const _port = this.#port as MsgPortWithStates;
    this.#stopListening?.();
    _port?._mrpc?.mrpcs?.delete(this.namespace);
  }

  #initPort(port: MRpcPort, namespace: string) {
    const _port = port as MsgPortWithStates;
    // ensure port states
    if (!_port._mrpc) {
      _port._mrpc = { mrpcs: new Map() };
    }
    // check namespace
    const { mrpcs } = _port._mrpc;
    if (mrpcs.has(namespace)) {
      throw new Error(
        `The namespace "${namespace}" has already been used by another MRpc instance on this port.`,
      );
    }
    mrpcs.set(namespace, this);
    // start listening
    port.start();
    this.#startListening(port);
  }

  #sendCallMsg(name: string, key: number, args: any[]) {
    const msg: MRpcMsgCall = {
      type: "call",
      ns: this.namespace,
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
      ns: this.namespace,
      name,
      key,
      ok,
      ret,
      err: err as any,
    };
    this.#port.postMessage(msg);
  }

  #startListening(port: MRpcPort) {
    const listener = async (event: MessageEvent) => {
      if (isMRpcMsgCall(event.data)) {
        // destructure the call message
        const { ns, name, key, args } = event.data;

        // check the namespace
        if (ns !== this.namespace) {
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
        if (ns !== this.namespace) {
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
}
