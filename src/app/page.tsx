"use client";

import { useMemo, useState, useEffect } from "react";

type Source =
  | "canvas"
  | "google_classroom"
  | "blackboard"
  | "moodle"
  | "notion"
  | "github_classroom"
  | "prairielearn"
  | "prairietest"
  | "smartphysics"
  | "manual";

type Assignment = {
  id: string;
  title: string;
  dueAt: string;
  course?: string;
  source: Source;
  url?: string;
  status: "todo" | "in_progress" | "done";
};

const sourceDisplayNames: Record<Source, string> = {
  canvas: "Canvas",
  google_classroom: "Google Classroom",
  blackboard: "Blackboard",
  moodle: "Moodle",
  notion: "Notion",
  github_classroom: "GitHub Classroom",
  prairielearn: "PrairieLearn",
  prairietest: "PrairieTest",
  smartphysics: "SmartPhysics",
  manual: "Manual",
};

function classNames(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function HomeworkSync() {
  const [connected, setConnected] = useState<Record<Source, boolean>>({
    canvas: false,
    google_classroom: false,
    blackboard: false,
    moodle: false,
    notion: false,
    github_classroom: false,
    prairielearn: false,
    prairietest: false,
    smartphysics: false,
    manual: true,
  });
  const [items, setItems] = useState<Assignment[]>([]);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [showAdd, setShowAdd] = useState(false);
  const [filterSources, setFilterSources] = useState<Source[]>([]);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState<number | null>(null);

  async function loadFromBackend() {
    try {
      const res = await fetch("/api/assignments", { cache: "no-store" });
      if (!res.ok) return;
      const data: Array<{
        id: string;
        title: string;
        course?: string;
        dueAt: string;
        url?: string;
        source: string;
        status?: string;
      }> = await res.json();
      if (Array.isArray(data) && data.length) {
        setItems(
          data.map((x) => ({
            id: x.id,
            title: x.title,
            course: x.course,
            dueAt: x.dueAt,
            url: x.url,
            source: x.source.toLowerCase().replace(/\s+/g, "_") as Source,
            status: (x.status === "completed" ? "done" : x.status || "todo") as Assignment["status"],
          }))
        );
      }
    } catch (e) {
      console.error("Failed to load assignments:", e);
    }
  }

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const bySource = filterSources.length ? filterSources.includes(it.source) : true;
      const byQuery = query
        ? `${it.title} ${it.course ?? ""}`.toLowerCase().includes(query.toLowerCase())
        : true;
      return bySource && byQuery;
    });
  }, [items, filterSources, query]);

  useEffect(() => {
    loadFromBackend();
    
    const params = new URLSearchParams(window.location.search);
    if (params.get("sync") === "success") {
      alert("Successfully connected! Your assignments will sync automatically.");
      window.history.replaceState({}, "", "/");
      loadFromBackend();
    } else if (params.get("sync") === "error") {
      alert("Connection failed. Please try again.");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [cursor, setCursor] = useState(new Date(today));
  const monthMatrix = useMemo(() => buildMonthMatrix(cursor), [cursor]);

  function toggleSource(src: Source) {
    setFilterSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
    );
  }

  async function connectPlatform(src: Source) {
    if (src === "canvas" || src === "google_classroom") {
      // For canvas, just mark as connected (no OAuth needed for ICS import)
      if (src === "canvas") {
        setConnected((c) => ({ ...c, [src]: true }));
      } else {
        // Google Classroom still uses OAuth
        window.location.href = `/api/auth/${src}`;
      }
    } else {
      setConnected((c) => ({ ...c, [src]: true }));
    }
  }

  async function syncPlatform(src: Source) {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: src }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(`Synced ${data.synced} new assignments from ${sourceDisplayNames[src]}!`);
        setConnected((c) => ({ ...c, [src]: true }));
        await loadFromBackend();
      } else {
        if (data.error?.includes("token") || data.error?.includes("authenticated")) {
          window.location.href = `/api/auth/${src}`;
        } else {
          alert(`Sync failed: ${data.error}`);
        }
      }
    } catch (error) {
      console.error("Sync error:", error);
      alert("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  function disconnect(src: Source) {
    setConnected((c) => ({ ...c, [src]: false }));
  }

  async function addManual(a: Omit<Assignment, "id" | "status" | "source">) {
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: a.title,
          course: a.course,
          dueAt: a.dueAt,
          url: a.url,
          status: "todo",
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setItems((prev) => [
          ...prev,
          {
            id: created.id,
            title: created.title,
            course: created.course,
            dueAt: created.dueAt,
            url: created.url,
            source: "manual",
            status: "todo",
          },
        ]);
        setShowAdd(false);
      }
    } catch (error) {
      console.error("Error adding assignment:", error);
    }
  }

  async function setStatus(id: string, status: Assignment["status"]) {
    const backendStatus = status === "done" ? "completed" : status;
    try {
      const res = await fetch("/api/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: backendStatus }),
      });

      if (res.ok) {
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  }

  async function deleteAssignment(id: string) {
    try {
      const res = await fetch(`/api/assignments?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }
    } catch (error) {
      console.error("Error deleting assignment:", error);
    }
  }

  async function handleCanvasICSFile(file: File) {
    if (!file) {
      alert("Please select a file");
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseICS(text);
      
      for (const e of parsed) {
        await fetch("/api/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: e.summary || "Untitled",
            dueAt: e.dtstart,
            course: e.course,
            url: e.url,
            status: "todo",
          }),
        });
      }
      
      setImportCount(parsed.length);
      await loadFromBackend();
    } catch (error) {
      console.error("Import error:", error);
    }
    setImporting(false);
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="size-9 rounded-2xl bg-black text-white grid place-items-center font-bold">
            HS
          </div>
          <div className="mr-auto">
            <h1 className="font-semibold">Homework Sync</h1>
            <p className="text-xs text-neutral-500">All assignments, one calendar.</p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assignments, courses…"
              className="px-3 py-2 rounded-xl border bg-white w-72"
            />
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90"
            >
              + Add Task
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
        <aside className="space-y-6">
          <section className="bg-white rounded-2xl shadow-sm border p-4">
            <h2 className="font-medium mb-3">Connections</h2>
            <div className="space-y-2">
              {(
                [
                  "canvas",
                  "google_classroom",
                  "blackboard",
                  "moodle",
                  "notion",
                  "github_classroom",
                  "prairielearn",
                  "prairietest",
                  "smartphysics",
                ] as Source[]
              ).map((src) => (
                <div key={src} className="flex flex-col gap-2 border-b last:border-b-0 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={classNames(
                          "inline-block size-2 rounded-full",
                          connected[src] ? "bg-green-500" : "bg-neutral-300"
                        )}
                      />
                      <span className="text-sm">{sourceDisplayNames[src]}</span>
                    </div>
                    {connected[src] ? (
                      <button
                        onClick={() => disconnect(src)}
                        className="text-xs px-2 py-1 rounded-lg border hover:bg-neutral-50"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectPlatform(src)}
                        className="text-xs px-2 py-1 rounded-lg bg-black text-white"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                  {src === "canvas" && connected[src] && (
  <div className="flex flex-col gap-2 text-xs">
    <div className="text-neutral-600 text-xs">
      <p className="mb-2">Export your Canvas calendar:</p>
      <ol className="list-decimal list-inside space-y-1 text-neutral-500">
        <li>Go to Canvas Calendar</li>
        <li>Click settings (gear icon)</li>
        <li>Export to .ics file</li>
      </ol>
    </div>
    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 cursor-pointer">
      <span>Import ICS file</span>
      <input
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleCanvasICSFile(e.target.files[0]);
          }
        }}
      />
    </label>
    {importing && <div className="text-neutral-600">Importing…</div>}
    {importCount != null && (
      <div className="text-green-600">✓ Imported {importCount} assignments</div>
    )}
  </div>
)}
                </div>
              ))}
            </div>
            <p className="text-xs text-neutral-500 mt-3">
              Connect platforms via OAuth or import ICS files. Changes sync to your database.
            </p>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border p-4">
            <h2 className="font-medium mb-3">Filters</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "canvas",
                  "google_classroom",
                  "blackboard",
                  "moodle",
                  "notion",
                  "github_classroom",
                  "prairielearn",
                  "prairietest",
                  "smartphysics",
                  "manual",
                ] as Source[]
              ).map((src) => (
                <button
                  key={src}
                  onClick={() => toggleSource(src)}
                  className={classNames(
                    "px-3 py-1.5 rounded-full border text-sm",
                    filterSources.includes(src)
                      ? "bg-black text-white border-black"
                      : "bg-white"
                  )}
                >
                  {sourceDisplayNames[src]}
                </button>
              ))}
            </div>
            <button onClick={() => setFilterSources([])} className="mt-3 text-xs underline">
              Clear
            </button>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border p-4">
            <h2 className="font-medium mb-2">How it works</h2>
            <ol className="list-decimal list-inside text-sm text-neutral-700 space-y-1">
              <li>Connect platforms or import calendar feeds.</li>
              <li>Assignments sync to your database automatically.</li>
              <li>Everything appears in one unified calendar.</li>
              <li>Add or edit items manually anytime.</li>
            </ol>
          </section>
        </aside>

        <main className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border overflow-hidden">
              <button
                onClick={() => setView("calendar")}
                className={classNames(
                  "px-3 py-2 text-sm",
                  view === "calendar" ? "bg-black text-white" : "bg-white"
                )}
              >
                Calendar
              </button>
              <button
                onClick={() => setView("list")}
                className={classNames(
                  "px-3 py-2 text-sm",
                  view === "list" ? "bg-black text-white" : "bg-white"
                )}
              >
                List
              </button>
            </div>
            <button onClick={loadFromBackend} className="px-3 py-2 rounded-xl border">
              Refresh
            </button>
            {view === "calendar" && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setCursor(shiftMonth(cursor, -1))}
                  className="px-3 py-2 rounded-xl border"
                >
                  ← Prev
                </button>
                <div className="px-3 py-2 text-sm">
                  {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
                </div>
                <button
                  onClick={() => setCursor(shiftMonth(cursor, 1))}
                  className="px-3 py-2 rounded-xl border"
                >
                  Next →
                </button>
                <button
                  onClick={() => setCursor(new Date(today))}
                  className="px-3 py-2 rounded-xl border"
                >
                  Today
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="px-3 py-2 rounded-xl bg-black text-white"
                >
                  + Add Task
                </button>
              </div>
            )}
            {view === "list" && (
              <div className="ml-auto">
                <button
                  onClick={() => setShowAdd(true)}
                  className="px-3 py-2 rounded-xl bg-black text-white"
                >
                  + Add Task
                </button>
              </div>
            )}
          </div>

          {view === "calendar" ? (
            <CalendarView monthMatrix={monthMatrix} items={filtered} today={today} />
          ) : (
            <ListView items={filtered} onSetStatus={setStatus} onDelete={deleteAssignment} />
          )}
        </main>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSubmit={addManual} />}

      <footer className="max-w-7xl mx-auto px-4 pb-12 pt-6 text-xs text-neutral-500">
        Full-stack integration with Canvas and Google Classroom OAuth sync.
      </footer>
    </div>
  );
}

function CalendarView({
  monthMatrix,
  items,
  today,
}: {
  monthMatrix: Date[][];
  items: Assignment[];
  today: Date;
}) {
  function itemsOn(d: Date) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const dd = d.getDate();
    return items.filter((it) => {
      const t = new Date(it.dueAt);
      return t.getFullYear() === y && t.getMonth() === m && t.getDate() === dd;
    });
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <div className="grid grid-cols-7 text-xs font-medium bg-neutral-50 border-b">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-3 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-neutral-200">
        {monthMatrix.flat().map((d, i) => {
          const outside = (i < 7 && d.getDate() > 7) || (i > 27 && d.getDate() < 7);
          const isToday = sameDate(d, today);
          const due = itemsOn(d);
          return (
            <div key={i} className="bg-white min-h-28 p-2">
              <div className="flex items-center justify-between">
                <span className={classNames("text-xs", outside && "text-neutral-300")}>
                  {d.getDate()}
                </span>
                {isToday && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black text-white">
                    Today
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-1">
                {due.slice(0, 4).map((it) => (
                  <a
                    key={it.id}
                    href={it.url || "#"}
                    className={classNames(
                      "block text-xs rounded-lg px-2 py-1 border truncate",
                      badgeColor(it.source)
                    )}
                    title={`${it.title}${it.course ? " – " + it.course : ""}`}
                  >
                    <span className="font-medium">{it.title}</span>
                    {it.course && <span className="opacity-70"> · {it.course}</span>}
                  </a>
                ))}
                {due.length > 4 && (
                  <div className="text-[10px] text-neutral-500">+{due.length - 4} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({
  items,
  onSetStatus,
  onDelete,
}: {
  items: Assignment[];
  onSetStatus: (id: string, status: Assignment["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const grouped = useMemo(() => groupByDate(items), [items]);
  const dates = Object.keys(grouped).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return (
    <div className="bg-white rounded-2xl shadow-sm border">
      {dates.length === 0 && (
        <div className="p-6 text-sm text-neutral-600">No assignments match your filters.</div>
      )}
      {dates.map((d) => (
        <div key={d} className="border-b last:border-b-0">
          <div className="px-4 py-2 bg-neutral-50 text-sm font-medium">
            {new Date(d).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          <ul className="divide-y">
            {grouped[d].map((it) => (
              <li key={it.id} className="p-4 flex items-center gap-3">
                <span
                  className={classNames("inline-block size-2 rounded-full", dotColor(it.status))}
                />
                <div className="mr-auto">
                  <div className="text-sm font-medium">{it.title}</div>
                  <div className="text-xs text-neutral-500">
                    {it.course ?? "General"} · {sourceDisplayNames[it.source]}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <select
                    value={it.status}
                    onChange={(e) => onSetStatus(it.id, e.target.value as any)}
                    className="px-2 py-1 rounded-lg border bg-white"
                  >
                    <option value="todo">To‑do</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                  {it.url && (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-lg border">
                      Open
                    </a>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("Delete this assignment?")) onDelete(it.id);
                    }}
                    className="px-2 py-1 rounded-lg border hover:bg-red-50 hover:border-red-300"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AddModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (a: Omit<Assignment, "id" | "status" | "source">) => void;
}) {
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [due, setDue] = useState(() => new Date().toISOString().slice(0, 16));
  const [url, setUrl] = useState("");
  function save() {
    if (!title.trim()) return;
    const dueAt = new Date(due).toISOString();
    onSubmit({ title, course: course || undefined, dueAt, url: url || undefined });
  }
  return (
    <div
      className="fixed inset-0 z-40 bg-black/30 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Add Task</h3>
          <button onClick={onClose} className="text-sm underline">
            Close
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border"
              placeholder="e.g., Problem Set 4"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Course (optional)</label>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border"
              placeholder="e.g., MATH 257"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Due date & time</label>
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Link (optional)</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border"
              placeholder="Paste assignment URL"
            />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-xl border">
            Cancel
          </button>
          <button onClick={save} className="px-3 py-2 rounded-xl bg-black text-white">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function shiftMonth(base: Date, delta: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthMatrix(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const weeks: Date[][] = [];
  let cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

function groupByDate(items: Assignment[]) {
  const map: Record<string, Assignment[]> = {};
  for (const it of items) {
    const d = new Date(it.dueAt);
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    (map[key] ||= []).push(it);
  }
  return map;
}

function badgeColor(source: Source) {
  switch (source) {
    case "canvas":
      return "bg-red-50 border-red-200";
    case "google_classroom":
      return "bg-emerald-50 border-emerald-200";
    case "blackboard":
      return "bg-neutral-50 border-neutral-200";
    case "moodle":
      return "bg-amber-50 border-amber-200";
    case "notion":
      return "bg-slate-50 border-slate-200";
    case "github_classroom":
      return "bg-indigo-50 border-indigo-200";
    case "prairielearn":
      return "bg-teal-50 border-teal-200";
    case "prairietest":
      return "bg-fuchsia-50 border-fuchsia-200";
    case "smartphysics":
      return "bg-lime-50 border-lime-200";
    case "manual":
      return "bg-blue-50 border-blue-200";
  }
}

function dotColor(status: Assignment["status"]) {
  switch (status) {
    case "todo":
      return "bg-neutral-400";
    case "in_progress":
      return "bg-amber-500";
    case "done":
      return "bg-green-500";
  }
}

function parseICS(raw: string) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const unfolded: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(" ")) {
      unfolded[unfolded.length - 1] = (unfolded[unfolded.length - 1] || "") + line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  const events: { summary: string; dtstart: string; url?: string; course?: string }[] = [];
  let cur: any = null;
  for (const l of unfolded) {
    if (l.startsWith("BEGIN:VEVENT")) cur = {};
    else if (l.startsWith("END:VEVENT")) {
      if (cur && cur.DTSTART && cur.SUMMARY) {
        const v = cur.DTSTART as string;
        let iso = "";
        if (/Z$/.test(v)) iso = new Date(v.replace(/^(?:DTSTART[^:]*:)/, "")).toISOString();
        else {
          const dt = v.replace(/^(?:DTSTART[^:]*:)/, "");
          const y = dt.slice(0, 4),
            m = dt.slice(4, 6),
            d = dt.slice(6, 8),
            h = dt.slice(9, 11) || "00",
            min = dt.slice(11, 13) || "00",
            s = dt.slice(13, 15) || "00";
          iso = new Date(
            Number(y),
            Number(m) - 1,
            Number(d),
            Number(h),
            Number(min),
            Number(s)
          ).toISOString();
        }
        const sum = String(cur.SUMMARY).replace(/^SUMMARY:/, "");
        const url = cur.URL ? String(cur.URL).replace(/^URL:/, "") : undefined;
        events.push({ summary: sum, dtstart: iso, url });
      }
      cur = null;
    } else if (cur) {
      const idx = l.indexOf(":");
      if (idx > -1) {
        const key = l.slice(0, idx);
        const val = l.slice(idx + 1);
        cur[key.split(";")[0]] = key.startsWith("DTSTART")
          ? key + ":" + val
          : key + ":" + val;
        if (key === "SUMMARY") cur.SUMMARY = "SUMMARY:" + val;
        if (key === "URL") cur.URL = "URL:" + val;
      }
    }
  }
  return events;
}