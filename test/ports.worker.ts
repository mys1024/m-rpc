import { WorkerGlobalScope } from "../src/types.ts";

// the global object in a worker is not the same as in the main thread
const workerGlobal = globalThis as unknown as WorkerGlobalScope;

// create a proxy message port for the worker global object
const { port1, port2 } = new MessageChannel();
port1.start();
workerGlobal.addEventListener("message", (event) => {
  port1.postMessage(event.data);
});
port1.addEventListener("message", (event) => {
  workerGlobal.postMessage(event.data);
});

// send the proxy message port to the main thread
workerGlobal.postMessage({ workerGlobalProxy: port2 }, {
  transfer: [port2],
});
