import {
  MRpcMsgCall,
  MRpcMsgPort,
  MRpcMsgRet,
  MsgPortNormalized,
} from "./types.ts";

function isMessagePort(port: MRpcMsgPort): port is MessagePort {
  return "MessagePort" in globalThis && port instanceof MessagePort;
}

function isWebSocket(port: MRpcMsgPort): port is WebSocket {
  return "WebSocket" in globalThis && port instanceof WebSocket;
}

function isMsgPortNormalized(port: MRpcMsgPort): port is MsgPortNormalized {
  return "postMessage" in port &&
    "addEventListener" in port &&
    "removeEventListener" in port;
}

export function sendMsg(port: MRpcMsgPort, message: any): void {
  if (isMessagePort(port)) {
    port.postMessage(message);
  } else if (isWebSocket(port)) {
    port.send(JSON.stringify(message));
  } else if (isMsgPortNormalized(port)) {
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
  if (isMessagePort(port)) {
    port.start();
    const _listener = (event: MessageEvent) => listener(event.data);
    port.addEventListener("message", _listener);
    return {
      stop: () => port.removeEventListener("message", _listener),
    };
  } else if (isWebSocket(port)) {
    const _listener = (event: MessageEvent) => listener(JSON.parse(event.data));
    port.addEventListener("message", _listener);
    return {
      stop: () => port.removeEventListener("message", _listener),
    };
  } else if (isMsgPortNormalized(port)) {
    const _listener = (event: MessageEvent) => listener(JSON.parse(event.data));
    port.addEventListener("message", _listener);
    return {
      stop: () => port.removeEventListener("message", _listener),
    };
  } else {
    throw new Error("Invalid port type.", { cause: port });
  }
}
