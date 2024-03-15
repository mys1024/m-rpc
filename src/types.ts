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

export type MsgPortNormalized =
  & (
    | {
      transferEnabled?: false;
      postMessage: (message: any) => void;
    }
    | {
      transferEnabled: true;
      postMessage: (
        message: any,
        options?: { transfer?: Transferable[] },
      ) => void;
    }
  )
  & {
    addEventListener: (
      type: "message",
      listener: (event: MessageEvent) => void,
    ) => void;
    removeEventListener: (
      type: "message",
      listener: (event: MessageEvent) => void,
    ) => void;
  };

export type MRpcMsgPort = MessagePort | Worker | WebSocket | MsgPortNormalized;

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

export interface MRpcOptions {
  /**
   * The namespace of the MRpc instance.
   * @default "default"
   */
  namespace?: string;

  /**
   * The timeout for remote function calls in milliseconds.
   * @default 5000
   */
  timeout?: number;

  /**
   * The callback to be called when the MRpc instance is disposed.
   */
  onDisposed?: () => void;
}
