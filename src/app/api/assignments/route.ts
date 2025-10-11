import { NextResponse } from "next/server";
import db from "@/lib/prisma";
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
      where: { userId },
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
    const data = rows.map((r: { dueAt: { toISOString: () => any; }; }) => ({ 
      ...r, 
      dueAt: r.dueAt.toISOString() 
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

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const assignment = await db.assignment.create({
      data: {
        userId,
        title: body.title,
        course: body.course,
        dueAt: new Date(body.dueAt),
        url: body.url || null,
        source: "manual",
        status: body.status || "todo"
      }
    });
    return NextResponse.json({
      ...assignment,
      dueAt: assignment.dueAt.toISOString()
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
      data: updates
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { error: "Assignment ID required" },
        { status: 400 }
      );
    }
    
    const result = await db.assignment.deleteMany({
      where: { id, userId }
    });
    
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting assignment:", error);
    return NextResponse.json(
      { error: "Failed to delete assignment" },
      { status: 500 }
    );
  }
}