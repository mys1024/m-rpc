import {
  MRpcMsgCall,
  MRpcMsgPort,
  MRpcMsgRet,
  WorkerGlobalScope,
} from "./types.ts";

/* -------------------------------------------------- MRpcMsgPort -------------------------------------------------- */

export function sendMsg(
  port: MRpcMsgPort,
  message: any,
): void {
  if (isMessagePort(port) || isWorker(port) || isWorkerGlobalScope(port)) {
    port.postMessage(message);
  } else if (isWebSocket(port)) {
    port.send(JSON.stringify(message));
  } else if (isMRpcMsgPortCommon(port)) {
    port.postMessage(port.serializer(message));
  } else {
    throw new Error("Invalid port type.", { cause: port });
  }
}

export function onMsg(
  port: MRpcMsgPort,
  listener: (msg: MRpcMsgCall | MRpcMsgRet) => void,
): {
  stop: () => void;
} {
  if (isMessagePort(port) || isWorker(port) || isWorkerGlobalScope(port)) {
    const _listener = (event: Event) => listener((event as MessageEvent).data);
    port.addEventListener("message", _listener);
    return { stop: () => port.removeEventListener("message", _listener) };
  } else if (isWebSocket(port)) {
    const _listener = (event: MessageEvent) => listener(JSON.parse(event.data));
    port.addEventListener("message", _listener);
    return { stop: () => port.removeEventListener("message", _listener) };
  } else if (isMRpcMsgPortCommon(port)) {
    const _listener = (event: MessageEvent) =>
      listener(port.deserializer(event.data));
    port.addEventListener("message", _listener);
    return { stop: () => port.removeEventListener("message", _listener) };
  } else {
    throw new Error("Invalid port type.", { cause: port });
  }
}

/* -------------------------------------------------- MRpcMsgPortCommon -------------------------------------------------- */

export class MRpcMsgPortCommon {
  #postMessage;
  #addEventListener;
  #removeEventListener;
  #serializer;
  #deserializer;

  constructor(options: {
    postMessage: (
      message: any,
    ) => void;
    addEventListener: (
      type: "message",
      listener: (event: MessageEvent) => void,
    ) => void;
    removeEventListener: (
      type: "message",
      listener: (event: MessageEvent) => void,
    ) => void;
    /**
     * @default "json"
     */
    serializer?: "json" | "as-is" | ((data: any) => any);
    /**
     * @default "json"
     */
    deserializer?: "json" | "as-is" | ((data: any) => any);
  }) {
    const {
      postMessage,
      addEventListener,
      removeEventListener,
      serializer = "json",
      deserializer = "json",
    } = options;
    this.#postMessage = postMessage;
    this.#addEventListener = addEventListener;
    this.#removeEventListener = removeEventListener;
    this.#serializer = serializer === "json"
      ? (data: any) => JSON.stringify(data)
      : serializer === "as-is"
      ? (data: any) => data
      : serializer;
    this.#deserializer = deserializer === "json"
      ? (data: any) => JSON.parse(data)
      : deserializer === "as-is"
      ? (data: any) => data
      : deserializer;
  }

  get postMessage(): (message: any) => void {
    return this.#postMessage;
  }

  get addEventListener(): (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void {
    return this.#addEventListener;
  }

  get removeEventListener(): (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void {
    return this.#removeEventListener;
  }

  get serializer(): (data: any) => any {
    return this.#serializer;
  }

  get deserializer(): (data: any) => any {
    return this.#deserializer;
  }
}

/* -------------------------------------------------- utils -------------------------------------------------- */

function isMessagePort(port: MRpcMsgPort): port is MessagePort {
  return "MessagePort" in globalThis && port instanceof MessagePort;
}

function isWebSocket(port: MRpcMsgPort): port is WebSocket {
  return "WebSocket" in globalThis && port instanceof WebSocket;
}

function isWorker(port: MRpcMsgPort): port is Worker {
  return "Worker" in globalThis && port instanceof Worker;
}

function isWorkerGlobalScope(port: MRpcMsgPort): port is WorkerGlobalScope {
  return port as unknown === globalThis &&
    "postMessage" in port &&
    "addEventListener" in port &&
    "removeEventListener" in port;
}

function isMRpcMsgPortCommon(port: MRpcMsgPort): port is MRpcMsgPortCommon {
  return port instanceof MRpcMsgPortCommon;
}
