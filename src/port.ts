import {
  MRpcMsgCall,
  MRpcMsgPort,
  MRpcMsgRet,
  MsgPortNormalized,
  MsgPortNormalizedPostMessageOptions,
  WorkerGlobalScope,
} from "./types.ts";

/* -------------------------------------------------- exports -------------------------------------------------- */

export function sendMsg(
  port: MRpcMsgPort,
  message: any,
  options?: MsgPortNormalizedPostMessageOptions,
): void {
  if (isMessagePort(port) || isWorker(port) || isWorkerGlobalScope(port)) {
    port.postMessage(message);
  } else if (isWebSocket(port)) {
    port.send(JSON.stringify(message));
  } else if (isMsgPortNormalized(port)) {
    port.postMessage(JSON.stringify(message), options);
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
  } else if (isWebSocket(port) || isMsgPortNormalized(port)) {
    const _listener = (event: Event) =>
      listener(JSON.parse((event as MessageEvent).data));
    port.addEventListener("message", _listener);
    return { stop: () => port.removeEventListener("message", _listener) };
  } else {
    throw new Error("Invalid port type.", { cause: port });
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

function isMsgPortNormalized(port: MRpcMsgPort): port is MsgPortNormalized {
  return "postMessage" in port &&
    "addEventListener" in port &&
    "removeEventListener" in port;
}
