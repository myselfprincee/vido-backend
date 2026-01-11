import { db } from "../db/db.js";
import { user } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function resolveUser(email: string, name: string = "Anonymous") {
  const found = await db
    .select()
    .from(user)
    .where(eq(user.email, email));

  if (found.length > 0) return found[0]!;

  const inserted = await db
    .insert(user)
    .values({ 
      id: uuidv4(),
      email: email,
      name: name 
    })
    .returning();

  return inserted[0]!;
}
