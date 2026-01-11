import { Server } from "socket.io";
import https from "https";

export function setupSockets(server: https.Server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    socket.on("join-room", async (msg) => {
      const payload = JSON.parse(msg);
      const roomId = payload.roomId;

      await socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);

      // Notify others that a peer joined
      socket.to(roomId).emit("peer-joined", {
        socketId: socket.id,
      });

      // Send existing participants to the new joiner
      const existingPeers = await io.in(roomId).fetchSockets();
      const participantsInfo = existingPeers
        .filter((s) => s.id !== socket.id)
        .map((s) => ({
          socketId: s.id,
        }));

      socket.emit("existing-participants", participantsInfo);
    });

    socket.on("offer-to-server", async (payload) => {
      io.to(payload.to).emit("offer", payload);
    });

    socket.on("answer-to-server", async (payload) => {
      io.to(payload.to).emit("answer", payload);
    });

    socket.on("ice-candidate-to-server", async (payload) => {
      io.to(payload.to).emit("ice-candidate", payload);
    });

    socket.on("disconnecting", async () => {
      const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
      for (const roomId of rooms) {
        socket.to(roomId).emit("peer-left", {
          socketId: socket.id,
        });
      }
    });
  });
}