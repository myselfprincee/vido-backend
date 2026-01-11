import { app } from "./server.js";
import { setupSockets } from "./socket.js";
import http from "http";

const server = http.createServer(app);

setupSockets(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});