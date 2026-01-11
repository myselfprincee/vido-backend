import { Server } from "socket.io";
import https from "https";
import { db } from "./db/db.js";
import { meeting, user, message } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// Store user info per socket
interface UserInfo {
  id: string;
  name: string;
  email: string;
  image?: string;
  isModerator: boolean;
}

// Message buffer types
interface BufferedMessage {
  id: string;
  meetingCode: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: Date;
}

// Track room moderators (meeting creator is the moderator)
const roomModerators: Map<string, string> = new Map(); // roomId -> moderator socketId
const socketUserInfo: Map<string, UserInfo> = new Map(); // socketId -> UserInfo
const meetingIdMap: Map<string, string> = new Map(); // meetingCode -> meetingId (UUID)
const messageBuffer: BufferedMessage[] = [];

async function getMeetingCreatorEmail(
  meetingCode: string
): Promise<string | null> {
  try {
    const result = await db
      .select({ creatorEmail: user.email })
      .from(meeting)
      .innerJoin(user, eq(meeting.createdById, user.id))
      .where(eq(meeting.meetingCode, meetingCode))
      .limit(1);

    return result.length > 0 ? result[0]?.creatorEmail ?? null : null;
  } catch (error) {
    console.error("Error getting meeting creator:", error);
    return null;
  }
}

async function getMeetingId(meetingCode: string): Promise<string | null> {
  if (meetingIdMap.has(meetingCode)) {
    return meetingIdMap.get(meetingCode)!;
  }

  try {
    const result = await db
      .select({ id: meeting.id })
      .from(meeting)
      .where(eq(meeting.meetingCode, meetingCode))
      .limit(1);

    if (result.length > 0 && result[0]) {
      meetingIdMap.set(meetingCode, result[0].id);
      return result[0].id;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching meeting ID for code ${meetingCode}:`, error);
    return null;
  }
}

async function flushMessages() {
  if (messageBuffer.length === 0) return;
  const messagesToSave = [...messageBuffer];
  messageBuffer.length = 0; // Clear buffer immediately
  console.log(`Flushing ${messagesToSave.length} messages to database...`);

  try {
    const validMessages = [];
    for (const msg of messagesToSave) {
      const meetingId = await getMeetingId(msg.meetingCode);
      if (meetingId) {
        validMessages.push({
          id: msg.id,
          meetingId: meetingId,
          senderId: msg.senderId,
          senderName: msg.senderName,
          content: msg.content,
          createdAt: msg.createdAt,
        });
      } else {
        console.warn(
          `Could not find meeting ID for code ${msg.meetingCode}, dropping message.`
        );
      }
    }

    if (validMessages.length > 0) {
      await db.insert(message).values(validMessages);
      console.log(`Successfully saved ${validMessages.length} messages.`);
    }
  } catch (error) {
    console.error("Error saving messages to database:", error);
  }
}

// Flush messages every 5 seconds
setInterval(flushMessages, 5000);

export function setupSockets(server: https.Server) {
  const io = new Server(server, {
    connectionStateRecovery: {
      maxDisconnectionDuration: 3 * 60 * 1000,
      skipMiddlewares: true,
    },
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    if (socket.recovered) {
      console.log(`User recovered! ID is still: ${socket.id}`);
    } else {
      console.log(`New session started with ID: ${socket.id}`);
    }

    socket.on("user-message", (msg) => {
      const { roomId, text, senderName } = msg;
      console.log("New message received:", msg);
      const messageData = {
        userId: socket.id,
        senderName: senderName || "Anonymous",
        text: text,
        time: new Date().toISOString(),
      };

      socket.to(roomId).emit("chat-message", messageData);

      messageBuffer.push({
        id: uuidv4(),
        meetingCode: roomId,
        senderId: socket.id,
        senderName: senderName || "Anonymous",
        content: text,
        createdAt: new Date(),
      });
    });

    socket.on("join-room", async (msg) => {
      const payload = JSON.parse(msg);
      const roomId = payload.roomId;
      const userEmail = payload.userEmail;
      const creatorEmail = await getMeetingCreatorEmail(roomId);
      const isCreator =
        creatorEmail !== null &&
        userEmail !== "" &&
        creatorEmail.toLowerCase() === userEmail.toLowerCase();
      const userInfo: UserInfo = {
        id: socket.id,
        name: payload.userName || "Anonymous",
        email: userEmail || "",
        image: payload.userImage || undefined,
        isModerator: isCreator,
      };

      if (isCreator) {
        roomModerators.set(roomId, socket.id);
        console.log(
          `${userInfo.name} (${userEmail}) is the meeting creator and moderator of room ${roomId}`
        );
      } else {
        console.log(
          `${userInfo.name} (${userEmail}) joined room ${roomId} as participant`
        );
      }

      socketUserInfo.set(socket.id, userInfo);
      await socket.join(roomId);

      io.to(roomId).except(socket.id).emit("peer-joined", {
        socketId: socket.id,
        userInfo: userInfo,
      });

      const existingPeers = await io.in(roomId).fetchSockets();
      const participantsInfo = existingPeers
        .filter((s) => s.id !== socket.id)
        .map((s) => ({
          socketId: s.id,
          userInfo: socketUserInfo.get(s.id) || {
            id: s.id,
            name: "Unknown",
            email: "",
            isModerator: false,
          },
        }));

      socket.emit("existing-participants", participantsInfo);
      console.log("rooms : ", io.sockets.adapter.rooms);
    });

    socket.on("offer-to-server", async (payload) => {
      const senderInfo = socketUserInfo.get(socket.id);
      io.to(payload.to).emit("offer", {
        ...payload,
        userInfo: senderInfo,
      });
    });

    socket.on("answer-to-server", async (payload) => {
      const senderInfo = socketUserInfo.get(socket.id);
      io.to(payload.to).emit("answer", {
        ...payload,
        userInfo: senderInfo,
      });
    });

    socket.on("ice-candidate-to-server", async (payload) => {
      io.to(payload.to).emit("ice-candidate", payload);
    });
    // Kick user (moderator only)
    socket.on("kick-user", async (payload) => {
      const { roomId, targetSocketId } = payload;
      const kickerInfo = socketUserInfo.get(socket.id);

      if (roomModerators.get(roomId) !== socket.id) {
        socket.emit("kick-error", {
          message: "Only the moderator can kick users",
        });
        return;
      }

      if (targetSocketId === socket.id) {
        socket.emit("kick-error", { message: "You cannot kick yourself" });
        return;
      }

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        const targetInfo = socketUserInfo.get(targetSocketId);
        console.log(
          `Moderator ${kickerInfo?.name} kicked ${targetInfo?.name} from room ${roomId}`
        );

        targetSocket.emit("kicked", {
          message: "You have been removed from the meeting by the moderator",
          kickedBy: kickerInfo?.name || "Moderator",
        });

        targetSocket.leave(roomId);

        io.to(roomId).emit("peer-left", {
          socketId: targetSocketId,
          reason: "kicked",
          userInfo: targetInfo,
        });

        socketUserInfo.delete(targetSocketId);
      }
    });
    // Handle disconnection
    socket.on("disconnecting", async () => {
      const userInfo = socketUserInfo.get(socket.id);
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);

      for (const roomId of rooms) {
        if (roomModerators.get(roomId) === socket.id) {
          const remainingSockets = await io.in(roomId).fetchSockets();
          const otherSockets = remainingSockets.filter(
            (s) => s.id !== socket.id
          );

          if (otherSockets.length > 0) {
            const newModerator = otherSockets[0]?.id;

            if (newModerator) {
              roomModerators.set(roomId, newModerator);
              const newModInfo = socketUserInfo.get(newModerator);

              if (newModInfo) {
                newModInfo.isModerator = true;
              }

              io.to(roomId).emit("moderator-changed", {
                newModeratorId: newModerator,
                newModeratorName: newModInfo?.name || "Unknown",
              });

              console.log(
                `New moderator for room ${roomId}: ${newModInfo?.name}`
              );
            } else {
              roomModerators.delete(roomId);
            }
          }
        }

        io.to(roomId).emit("peer-left", {
          socketId: socket.id,
          reason: "disconnected",
          userInfo: userInfo,
        });
      }

      socketUserInfo.delete(socket.id);
    });
  });
}
