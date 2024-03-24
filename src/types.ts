import { MRpcMsgPortCommon } from "./ports.ts";

/* -------------------------------------------------- general -------------------------------------------------- */

export type AnyFn = (...args: any[]) => any;

export type AwaitedRet<FN extends AnyFn> = Awaited<ReturnType<FN>>;

export type RemoteRet<FN extends AnyFn> = Promise<AwaitedRet<FN>>;

export type RemoteFn<FN extends AnyFn> = (
  ...args: Parameters<FN>
) => RemoteRet<FN>;

export type RemoteFns<FNS extends Record<string, AnyFn>> = {
  [P in keyof FNS]: RemoteFn<FNS[P]>;
};

/* -------------------------------------------------- ports -------------------------------------------------- */

interface MRpcMsgBase {
  ns: string;
  name: string;
  key: number;
}

export type MRpcMsgCall<FN extends AnyFn = AnyFn> =
  & MRpcMsgBase
  & {
    type: "call";
    args: Parameters<FN>;
  };

export type MRpcMsgRet<FN extends AnyFn = AnyFn> =
  & MRpcMsgBase
  & {
    type: "ret";
  }
  & (
    | { ok: true; ret: AwaitedRet<FN>; err?: undefined }
    | { ok: false; ret?: undefined; err: string }
  );

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope
 */
export interface WorkerGlobalScope {
  postMessage: Worker["postMessage"];
  addEventListener: Worker["addEventListener"];
  removeEventListener: Worker["removeEventListener"];
}

/**
 * The message port for MRpc.
 */
export type MRpcMsgPort =
  | MessagePort
  | WebSocket
  | Worker
  | WorkerGlobalScope
  | MRpcMsgPortCommon;

/* -------------------------------------------------- MRpc -------------------------------------------------- */

/**
 * The options for remote function calls.
 */
export interface MRpcCallOptions {
  /**
   * The timeout for remote function calls in milliseconds.
   * @default 3000
   */
  timeout?: number;

  /**
   * The number of retries for timed out remote function calls.
   * @default 0
   */
  retry?: number;
}

/**
 * The options for MRpc constructor.
 */
export interface MRpcOptions {
  /**
   * The namespace of the MRpc instance.
   * @default "default"
   */
  namespace?: string;

  /**
   * The options for remote function calls, which's priority is lower than the options passed to `callRemoteFn`.
   */
  callOptions?: MRpcCallOptions;
}
