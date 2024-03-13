import { MRpcMsgCall, MRpcMsgRet } from "./types.ts";

export function isMRpcMsgCall(val: any): val is MRpcMsgCall {
  return val?.type === "call";
}

export function isMRpcMsgRet(val: any): val is MRpcMsgRet {
  return val?.type === "ret";
}
