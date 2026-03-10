export async function api(path: string, opts: { method?: string; body?: any } = {}) {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try { const body = await res.json(); errMsg = body.error || errMsg; } catch {}
    throw new Error(errMsg);
  }
  const data = await res.json();
  return data;
}
