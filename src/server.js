import {
  createFiberOpsConfig,
  createFiberOpsServer
} from "./lib/server-app.js";

const config = createFiberOpsConfig();
const server = createFiberOpsServer(config);

server.listen(config.port, config.host, () => {
  console.log(`FiberOps running at http://${config.host}:${config.port}`);
});
