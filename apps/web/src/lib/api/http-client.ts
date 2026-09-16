const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function authFetch(
  endpoint: string,
  options: RequestInit,
  accessToken: string | null,
): Promise<Response> {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(!isFormData && { "Content-Type": "application/json" }),
    ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    ...options.headers,
  };

  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });
}

export async function readApiError(response: Response, fallback: string) {
  const error = await response.json().catch(() => ({ message: fallback }));
  const message = error?.message;

  if (Array.isArray(message)) return message.join(", ");
  if (typeof message === "string" && message.trim()) return message;
  return fallback || `HTTP ${response.status}`;
}

export async function throwApiError(response: Response, fallback: string) {
  throw new Error(await readApiError(response, fallback));
}
