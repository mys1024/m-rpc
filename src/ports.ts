import {
  MRpcMsgCall,
  MRpcMsgPort,
  MRpcMsgRet,
  WorkerGlobalScope,
} from "./types.ts";

/* -------------------------------------------------- exports -------------------------------------------------- */

export function sendMsg(
  port: MRpcMsgPort,
  message: any,
): void {
  if (isMessagePort(port) || isWorker(port) || isWorkerGlobalScope(port)) {
    port.postMessage(message);
  } else if (isWebSocket(port)) {
    port.send(JSON.stringify(message));
  } else if (isMRpcMsgPortCommon(port)) {
    port.postMessage(JSON.stringify(message));
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
    if (isMessagePort(port)) {
      port.start();
    }
    const _listener = (event: Event) => listener((event as MessageEvent).data);
    port.addEventListener("message", _listener);
    return { stop: () => port.removeEventListener("message", _listener) };
  } else if (isWebSocket(port) || isMRpcMsgPortCommon(port)) {
    const _listener = (event: Event) =>
      listener(JSON.parse((event as MessageEvent).data));
    port.addEventListener("message", _listener);
    return { stop: () => port.removeEventListener("message", _listener) };
  } else {
    throw new Error("Invalid port type.", { cause: port });
  }
}

/* -------------------------------------------------- MRpcMsgPortCommon -------------------------------------------------- */

export class MRpcMsgPortCommon {
  postMessage;
  addEventListener;
  removeEventListener;

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
  }) {
    const { postMessage, addEventListener, removeEventListener } = options;
    this.postMessage = postMessage;
    this.addEventListener = addEventListener;
    this.removeEventListener = removeEventListener;
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
  return port as any === globalThis &&
    "postMessage" in port &&
    "addEventListener" in port &&
    "removeEventListener" in port;
}

function isMRpcMsgPortCommon(port: MRpcMsgPort): port is MRpcMsgPortCommon {
  return port instanceof MRpcMsgPortCommon;
}
