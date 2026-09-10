import { db } from "@/lib/db";
import { shouldLog } from "@/lib/config";

export async function auditLog(event: string, details: Record<string, unknown>, ip?: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, event, ...details };
  if (shouldLog) console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);

  try {
    await db.auditLog.create({
      data: {
        event,
        email: typeof details.email === "string" ? details.email : null,
        role: typeof details.role === "string" ? details.role : null,
        targetId: typeof details.targetId === "string" ? details.targetId : null,
        ip: ip || null,
        details: JSON.stringify(details),
      },
    });

    // Compliance records are retained indefinitely.
  } catch (error) {
    // Never let audit log failure break authentication
    console.error("[AUDIT LOG ERROR]", error);
  }
}

