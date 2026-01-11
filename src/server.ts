import express, { Request, Response } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createMeeting,
  getMeetingByCode,
  getUserMeetings,
  deleteMeeting,
} from "./services/meetingService.js";
import {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
} from "./middleware/errorHandler.js";
import {
  validateMeetingCodeParam,
  validateRequestBody,
} from "./middleware/validation.js";
import { logger } from "./config/logger.js";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { db } from "./db/db.js";
import { auth } from "./auth.js";
import { user } from "./db/schema.js";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const app: express.Application = express();

// Trust proxy for production

app.set("trust proxy", 1);

// Request body validation

app.use(validateRequestBody);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "https://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

app.all("/api/auth/{*path}", toNodeHandler(auth));

app.use(express.json({ limit: "10kb" }));

// Health check endpoint - used for monitoring and load balancers

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Home page

app.get("/", (_req, res) => {
  const templatePath = path.join(
    __dirname,
    "public",
    "templates",
    "express.html"
  );
  const html = fs.readFileSync(templatePath, "utf-8");
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// Get current user session

app.get(
  "/api/me",
  asyncHandler(async (req: Request, res: Response) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    res.json(session);
  })
);

// Update user profile

app.put(
  "/api/user/profile",
  asyncHandler(async (req, res) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session || !session.user) {
      throw new AppError("Unauthorized", 401);
    }
    const { name, image } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new AppError(
        "Name is required and must be a non-empty string",
        400
      );
    }
    const updatedUser = await db
      .update(user)
      .set({
        name: name.trim(),
        image: image || null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, session.user.id))
      .returning();
    res.json({
      success: true,
      data: updatedUser[0],
    });
  })
);

// Create new meeting

app.post(
  "/api/meetings/create",
  asyncHandler(async (req, res) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session || !session.user) {
      throw new AppError("Unauthorized", 401);
    }
    const newMeeting = await createMeeting(session.user.id);
    res.status(201).json({
      success: true,
      data: newMeeting,
    });
  })
);

// Get meeting by code

app.get(
  "/api/meetings/:code",
  validateMeetingCodeParam,
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    if (!code) {
      throw new AppError("code not found", 404);
    }
    const meetingData = await getMeetingByCode(code.toUpperCase());
    if (!meetingData) {
      throw new AppError("Meeting not found", 404);
    }
    const now = new Date();
    if (meetingData.expiresAt < now || !meetingData.isActive) {
      throw new AppError("Meeting has expired", 410);
    }
    res.json({
      success: true,
      data: meetingData,
    });
  })
);

// Get user's meetings

app.get(
  "/api/meetings",
  asyncHandler(async (req, res) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session || !session.user) {
      throw new AppError("Unauthorized", 401);
    }
    const userMeetings = await getUserMeetings(session.user.id);
    res.json({
      success: true,
      data: userMeetings,
    });
  })
);

// Delete meeting

app.delete(
  "/api/meetings/:id",
  asyncHandler(async (req, res) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session || !session.user) {
      throw new AppError("Unauthorized", 401);
    }
    const { id } = req.params;
    if (!id) {
      throw new Error("id doesn't exists.");
    }
    const success = await deleteMeeting(id, session.user.id);
    if (!success) {
      throw new AppError("Meeting not found or unauthorized", 404);
    }
    res.json({
      success: true,
      message: "Meeting deleted successfully",
    });
  })
);

// 404 handler - must be after all routes

app.use(notFoundHandler);

// Global error handler - must be last

app.use(errorHandler);

logger.info("Server configured successfully");
