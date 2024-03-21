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

/* -------------------------------------------------- MRpc -------------------------------------------------- */

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

export interface MsgPortNormalizedPostMessageOptions {
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#targetOrigin
   */
  targetOrigin?: string;

  /**
   * TODO.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage#transfer
   */
  transfer?: Transferable[];
}

export type MsgPortNormalized = {
  postMessage: (
    message: any,
    options?: MsgPortNormalizedPostMessageOptions,
  ) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
};

/**
 * The message port for MRpc.
 */
export type MRpcMsgPort = MessagePort | WebSocket | MsgPortNormalized;

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
   * The timeout for remote function calls in milliseconds.
   * @default 3000
   */
  timeout?: number;

  /**
   * The number of retries for timed out remote function calls.
   * @default 0
   */
  retry?: number;

  /**
   * The callback to be called when the MRpc instance is disposed.
   */
  onDisposed?: () => void;

  /**
   * Only available for {@link MsgPortNormalized.postMessage()}.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#targetOrigin
   */
  targetOrigin?: string;
}

/**
 * The options for remote function calls.
 */
export interface MRpcCallOptions {
  /**
   * The timeout for remote function calls in milliseconds.
   */
  timeout?: number;

  /**
   * The number of retries for timed out remote function calls.
   */
  retry?: number;
}
