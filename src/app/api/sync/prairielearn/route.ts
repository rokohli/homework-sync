// src/app/api/prairielearn/sync/route.ts
/*import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { cookies } from "next/headers";
import { plFetch } from "@/lib/prairielearn";

async function getUserId() {
  const c = (await cookies()).get("uid");
  return c?.value;
}

type PLAssessment = { id: number; title?: string; name?: string };
type PLAccessRule = { end_date?: string | null };

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "User not authenticated" }, { status: 401 });

    const { courseInstanceId } = await request.json();
    if (!courseInstanceId) {
      return NextResponse.json({ error: "courseInstanceId required" }, { status: 400 });
    }

    const baseUrl = process.env.PRAIRIELEARN_BASE_URL ?? "https://us.prairielearn.com";
    const token = process.env.PRAIRIELEARN_PAT; // keep server-side
    if (!token) return NextResponse.json({ error: "Missing PRAIRIELEARN_PAT" }, { status: 500 });

    // 1) List assessments
    const assessments = await plFetch<PLAssessment[]>(
      baseUrl,
      `/course_instances/${courseInstanceId}/assessments`,
      token
    );

    let imported = 0;

    for (const a of assessments) {
      const title = String(a.title ?? a.name ?? `Assessment ${a.id}`);

      // 2) Best-effort due date from access rules (may be forbidden for student PAT)
      let dueAt: Date | null = null;
      try {
        const rules = await plFetch<PLAccessRule[]>(
          baseUrl,
          `/course_instances/${courseInstanceId}/assessments/${a.id}/assessment_access_rules`,
          token
        );

        const ends = rules
          .map(r => r.end_date)
          .filter(Boolean)
          .map(s => new Date(String(s)))
          .filter(d => !isNaN(d.getTime()))
          .sort((x, y) => y.getTime() - x.getTime());

        dueAt = ends[0] ?? null;
      } catch {
        // ignore if not permitted
      }

      const externalId = `pl:ci:${courseInstanceId}:a:${a.id}`;
      const url = `${baseUrl.replace(/\/$/, "")}/pl/course_instance/${courseInstanceId}/assessment/${a.id}`;

      // Avoid duplicates by upserting (requires unique key; if you don't have one, use findFirst+update/create)
      await db.assignment.upsert({
        where: {
          userId_source_externalId: {
            userId,
            source: "prairielearn",
            externalId,
          },
        },
        update: { title, dueAt, url, source: "prairielearn" },
        create: {
          userId,
          title,
          course: null,
          dueAt,
          url,
          source: "prairielearn",
          status: "todo",
          externalId,
        },
      });

      imported++;
    }

    return NextResponse.json({ imported });
  } catch (e: any) {
    // If you're blocked as a student, you'll likely see 401/403 here
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}*/