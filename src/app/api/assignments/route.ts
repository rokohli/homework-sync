import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { cookies } from "next/headers";

async function getUserId() {
  const c = (await cookies()).get("uid");
  if (c?.value) return c.value;
  const id = crypto.randomUUID();
  (await cookies()).set("uid", id, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", 
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
  return id;
}

export async function GET() {
  try {
    const userId = await getUserId();
    const rows = await db.assignment.findMany({
      where: { userId,
      NOT: { status: { in: ["done", "completed"] } },
    },
      orderBy: { dueAt: "asc" },
      select: { 
        id: true, 
        title: true, 
        course: true, 
        dueAt: true, 
        url: true, 
        source: true, 
        status: true 
      },
    });
    const data = rows.map((r) => ({
      ...r,
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    }));
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignments" },
      { status: 500 }
    );
  }
}
function normalizeCourse(dept: string, num: string) {
  return `${dept.toUpperCase()} ${num}`;
}

function extractCourse(title: string): { cleanTitle: string; course: string | null } {
  const original = (title ?? "").trim();
  let cleanTitle = original;
  let course: string | null = null;

  // A) Canvas bracket context: "... [ece_210_120261_256342]"
  const bracketMatch = cleanTitle.match(/\s*\[([^\]]+)\]\s*$/);
  if (bracketMatch) {
    const bracket = bracketMatch[1].trim(); // e.g. "ece_210_120261_256342"
    cleanTitle = cleanTitle.replace(/\s*\[[^\]]+\]\s*$/, "").trim();

    const parts = bracket.split("_").filter(Boolean);
    if (
      parts.length >= 2 &&
      /^[a-zA-Z]+$/.test(parts[0]) &&
      /^\d+$/.test(parts[1])
    ) {
      course = normalizeCourse(parts[0], parts[1]); // "ECE 210"
    } else {
      course = bracket; // fallback (still useful)
    }
  }

  // B) Parentheses metadata: "... (ECE 210 AB1 Spring 2026 CRN74914)"
  // Only use if course not found yet.
  if (!course) {
    const parenMatch = cleanTitle.match(/\(([A-Za-z]{2,})\s+(\d{2,3})\b[^)]*\)\s*$/);
    if (parenMatch) {
      course = normalizeCourse(parenMatch[1], parenMatch[2]); // "ECE 210"
      // Remove the trailing parentheses block from title (it's usually metadata)
      cleanTitle = cleanTitle.replace(/\s*\([^)]*\)\s*$/, "").trim();
    }
  }

  return { cleanTitle, course };
}
export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    
    const incomingTitle = String(body.title ?? "").trim();
    const { cleanTitle, course: canvasCourse } = extractCourse(incomingTitle);
    const course = body.course || canvasCourse || "General";

    const assignment = await db.assignment.create({
      data: {
        userId,
        title: cleanTitle || incomingTitle ||  "Untitled Assignment",
        course: body.course || canvasCourse || "General",
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        url: body.url || null,
        source: body.source || "manual",
        status: body.status || "todo"
      }
    });
    return NextResponse.json({
      ...assignment,
      dueAt: assignment.dueAt?.toISOString() ?? null
    });
  } catch (error) {
    console.error("Error creating assignment:", error);
    return NextResponse.json(
      { error: "Failed to create assignment" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (updates.dueAt) {
      updates.dueAt = new Date(updates.dueAt);
    }
    
    const assignment = await db.assignment.updateMany({
      where: { id, userId },
      data: updates,
    });
    
    if (assignment.count === 0) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating assignment:", error);
    return NextResponse.json(
      { error: "Failed to update assignment" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const source = searchParams.get("source"); // optional: "canvas", "manual", etc.

    // If an id is provided, delete just that one
    if (id) {
      const result = await db.assignment.deleteMany({
        where: { id, userId },
      });

      if (result.count === 0) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      return NextResponse.json({ deleted: result.count });
    }

    // If NO id, delete all for this user (optionally filter by source)
    const result = await db.assignment.deleteMany({
      where: {
        userId,
        ...(source ? { source } : {}),
      },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("Error deleting assignment(s):", error);
    return NextResponse.json({ error: "Failed to delete assignment(s)" }, { status: 500 });
  }
}