import { db } from "../db/db.js";
import { meeting } from "../db/schema.js";
import { eq, and, lt } from "drizzle-orm";

// Generate a random meeting code in format: abc-abcd-abc
function generateMeetingCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let code = "";

  // First segment: 3 letters
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += "-";

  // Second segment: 4 letters
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += "-";

  // Third segment: 3 letters
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}

// Check if a meeting code exists and is active
async function isCodeActiveAndValid(code: string): Promise<boolean> {
  const existingMeeting = await db
    .select()
    .from(meeting)
    .where(
      and(
        eq(meeting.meetingCode, code),
        eq(meeting.isActive, true)
        // expiresAt > now() is implicit with isActive check
      )
    )
    .limit(1);

  return existingMeeting.length > 0;
}

// Deactivate expired meetings
async function deactivateExpiredMeetings(): Promise<void> {
  await db
    .update(meeting)
    .set({ isActive: false })
    .where(lt(meeting.expiresAt, new Date()));
}

// Generate a unique meeting code (with retry logic)
async function generateUniqueMeetingCode(): Promise<string> {
  await deactivateExpiredMeetings();

  let code = generateMeetingCode();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const isActive = await isCodeActiveAndValid(code);
    if (!isActive) {
      return code;
    }
    code = generateMeetingCode();
    attempts++;
  }

  throw new Error(
    "Failed to generate unique meeting code after multiple attempts"
  );
}

// Create a new meeting
async function createMeeting(userId: string): Promise<{
  id: string;
  meetingCode: string;
  createdById: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}> {
  const meetingCode = await generateUniqueMeetingCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days

  const newMeeting = await db
    .insert(meeting)
    .values({
      id: `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      meetingCode,
      createdById: userId,
      expiresAt,
    })
    .returning();

  if (!newMeeting[0]) {
    throw new Error("Failed to create meeting");
  }

  return newMeeting[0];
}

// Get a meeting by code
async function getMeetingByCode(code: string): Promise<{
  id: string;
  meetingCode: string;
  createdById: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
} | null> {
  const result = await db
    .select()
    .from(meeting)
    .where(eq(meeting.meetingCode, code))
    .limit(1);

  return result[0] ?? null;
}

// Get all meetings created by a user
async function getUserMeetings(userId: string): Promise<
  Array<{
    id: string;
    meetingCode: string;
    createdById: string;
    createdAt: Date;
    expiresAt: Date;
    isActive: boolean;
  }>
> {
  return await db
    .select()
    .from(meeting)
    .where(eq(meeting.createdById, userId));
}

// Delete a meeting
async function deleteMeeting(meetingId: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(meeting)
    .where(and(eq(meeting.id, meetingId), eq(meeting.createdById, userId)))
    .returning();

  return result.length > 0;
}

export {
  generateUniqueMeetingCode,
  createMeeting,
  getMeetingByCode,
  getUserMeetings,
  deactivateExpiredMeetings,
  deleteMeeting,
};
