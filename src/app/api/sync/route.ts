import { NextResponse } from "next/server";
import db from "@/lib/prisma";
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

/*async function syncCanvas(userId: string) {
  // Get the user's Canvas token
  const token = await db.userToken.findFirst({
    where: { userId, platform: "canvas" }
  });

  if (!token) {
    throw new Error("Canvas token not found");
  }

  const canvasDomain = process.env.CANVAS_DOMAIN || "canvas.instructure.com";
  
  // Fetch user's courses
  const coursesRes = await fetch(
    `https://${canvasDomain}/api/v1/courses?enrollment_state=active&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
    }
  );

  if (!coursesRes.ok) {
    throw new Error("Failed to fetch Canvas courses");
  }

  const courses = await coursesRes.json();
  let totalSynced = 0;

  // Fetch assignments for each course
  for (const course of courses) {
    const assignmentsRes = await fetch(
      `https://${canvasDomain}/api/v1/courses/${course.id}/assignments?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
        },
      }
    );

    if (!assignmentsRes.ok) continue;

    const assignments = await assignmentsRes.json();

    for (const assignment of assignments) {
      // Skip assignments without due dates
      if (!assignment.due_at) continue;

      // Check if assignment already exists
      const existing = await db.assignment.findFirst({
        where: {
          userId,
          source: "canvas",
          url: assignment.html_url,
        },
      });

      if (existing) {
        // Update existing assignment
        await db.assignment.update({
          where: { id: existing.id },
          data: {
            title: assignment.name,
            course: course.name,
            dueAt: new Date(assignment.due_at),
            status: assignment.submission?.submitted_at ? "done" : "todo",
          },
        });
      } else {
        // Create new assignment
        await db.assignment.create({
          data: {
            userId,
            title: assignment.name,
            course: course.name,
            dueAt: new Date(assignment.due_at),
            url: assignment.html_url,
            source: "canvas",
            status: "todo",
          },
        });
        totalSynced++;
      }
    }
  }

  return totalSynced;
}*/

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