import { app } from "./server.js";
import { setupSockets } from "./socket.js";
import https from "https";
import fs from "fs";

const options = {
  key: fs.readFileSync("certs/key.pem"),
  cert: fs.readFileSync("certs/cert.pem"),
};

const server = https.createServer(options, app);

setupSockets(server);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`HTTPS Backend running on port ${PORT}`);
});