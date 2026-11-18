/** Tiny fetch wrapper for client components: JSON in/out, readable errors. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public fields?: Record<string, string[] | undefined>) {
    super(message);
  }
}

export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message: string; code?: string; fields?: Record<string, string[]> } } & T;
  if (!res.ok) {
    const err = data.error;
    throw new ApiError(err?.message ?? (res.status === 0 ? "Network error — check your connection." : "Something went wrong."), res.status, err?.code, err?.fields);
  }
  return data as T;
}
