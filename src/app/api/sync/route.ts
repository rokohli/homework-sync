import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { cookies } from "next/headers";

async function getUserId() {
  const c = (await cookies()).get("uid");
  return c?.value;
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { platform } = body;

    let syncedCount = 0;

    /*if (platform === "canvas") {
      syncedCount = await syncCanvas(userId);*/
    if (platform === "google_classroom") {
      syncedCount = await syncGoogleClassroom(userId);
    } else {
      return NextResponse.json(
        { error: "Unsupported platform" },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      synced: syncedCount,
      message: `Synced ${syncedCount} assignments from ${platform}`
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}

async function syncGoogleClassroom(userId: string) {
  // Get the user's Google token
  const token = await db.userToken.findFirst({
    where: { userId, platform: "google_classroom" }
  });

  if (!token) {
    throw new Error("Google Classroom token not found");
  }

  // Fetch all courses
  const coursesRes = await fetch(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=100",
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
    }
  );

  if (!coursesRes.ok) {
    throw new Error("Failed to fetch Google Classroom courses");
  }

  const coursesData = await coursesRes.json();
  const courses = coursesData.courses || [];
  let totalSynced = 0;

  // Fetch coursework for each course
  for (const course of courses) {
    const courseworkRes = await fetch(
      `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?pageSize=100`,
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
        },
      }
    );

    if (!courseworkRes.ok) continue;

    const courseworkData = await courseworkRes.json();
    const courseworks = courseworkData.courseWork || [];

    for (const work of courseworks) {
      // Skip work without due dates
      if (!work.dueDate) continue;

      const dueDate = new Date(
        work.dueDate.year,
        work.dueDate.month - 1,
        work.dueDate.day,
        work.dueTime?.hours || 23,
        work.dueTime?.minutes || 59
      );

      const workUrl = work.alternateLink || `https://classroom.google.com/c/${course.id}/a/${work.id}`;

      // Check if assignment already exists
      const existing = await db.assignment.findFirst({
        where: {
          userId,
          source: "google_classroom",
          url: workUrl,
        },
      });

      if (existing) {
        // Update existing
        await db.assignment.update({
          where: { id: existing.id },
          data: {
            title: work.title,
            course: course.name,
            dueAt: dueDate,
          },
        });
      } else {
        // Create new
        await db.assignment.create({
          data: {
            userId,
            title: work.title,
            course: course.name,
            dueAt: dueDate,
            url: workUrl,
            source: "google_classroom",
            status: "todo",
          },
        });
        totalSynced++;
      }
    }
  }

  return totalSynced;
}