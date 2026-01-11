import express, {Request, Response} from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { validateRequestBody } from "./middleware/validation.js";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";

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
  const templatePath = path.join(__dirname, "public", "templates", "express.html");
  const html = fs.readFileSync(templatePath, "utf-8");
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});