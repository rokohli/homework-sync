// src/lib/prairielearn.ts
/*export async function plFetch<T>(
  baseUrl: string,
  path: string,
  token: string
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}/pl/api/v1${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    headers: { "Private-Token": token },
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`PrairieLearn ${res.status}: ${text}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}*/