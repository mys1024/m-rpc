<div align="center">

# m-rpc

[![jsr-version](https://img.shields.io/jsr/v/%40mys/m-rpc?style=flat-square&color=%23f7df1e)](https://jsr.io/@mys/m-rpc)
[![npm-version](https://img.shields.io/npm/v/%40mys-x%2Fm-rpc?style=flat-square&color=%23cb3837)](https://www.npmjs.com/package/@mys-x/m-rpc)
[![npm-minzip](https://img.shields.io/bundlephobia/minzip/%40mys-x%2Fm-rpc?style=flat-square&label=minzip)](https://bundlephobia.com/package/@mys-x/m-rpc)
[![docs](https://img.shields.io/badge/docs-reference-blue?style=flat-square)](https://jsr.io/@mys/m-rpc/doc?style=flat-square)
[![stars](https://img.shields.io/github/stars/mys1024/m-rpc?style=flat-square)](https://github.com/mys1024/m-rpc)
[![license](https://img.shields.io/github/license/mys1024/m-rpc?&style=flat-square)](./LICENSE)

[![coverage](https://img.shields.io/codecov/c/github/mys1024/m-rpc?style=flat-square)](https://app.codecov.io/gh/mys1024/m-rpc)
[![workflow-ci](https://img.shields.io/github/actions/workflow/status/mys1024/m-rpc/ci.yml?label=ci&style=flat-square)](https://github.com/mys1024/m-rpc/actions/workflows/ci.yml)
[![workflow-release](https://img.shields.io/github/actions/workflow/status/mys1024/m-rpc/release.yml?label=release&style=flat-square)](https://github.com/mys1024/m-rpc/actions/workflows/release.yml)

_A message based RPC library._

</div>

## Usage

### basic

```typescript
import { MRpc } from "@mys-x/m-rpc"; // or "jsr:@mys/m-rpc"

function add(a: number, b: number) {
  return a + b;
}

// The port can be a MessagePort, a WebSocket, a Worker, or a WorkerGlobalScope
const { port1, port2 } = new MessageChannel();
const rpc1 = new MRpc(port1);
const rpc2 = new MRpc(port2);

rpc1.defineLocalFn("add", add);
await rpc2.callRemoteFn<typeof add>("add", [1, 2]); // 3
```

## License

[MIT](./LICENSE) License &copy; 2024-PRESENT
[mys1024](https://github.com/mys1024)
