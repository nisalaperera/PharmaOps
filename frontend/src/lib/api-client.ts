import axios, { type AxiosInstance } from "axios";
import { getSession } from "next-auth/react";
import type { Session } from "next-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Token cache ──────────────────────────────────────────────────────────────
// Avoids calling getSession() (an HTTP round-trip) on every API request.
// Concurrent requests share one in-flight getSession() call; result is cached
// for 5 minutes (conservative — JWT lifetime is 8 h).

let cachedToken:      string | null               = null;
let tokenCacheExpiry: number                      = 0;
let inflightSession:  Promise<Session | null> | null = null;

async function getTokenCached(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < tokenCacheExpiry - 60_000) {
    return cachedToken;
  }
  if (!inflightSession) {
    inflightSession = getSession().finally(() => { inflightSession = null; });
  }
  const session = await inflightSession;
  if (session?.user?.accessToken) {
    cachedToken      = session.user.accessToken;
    tokenCacheExpiry = now + 5 * 60 * 1000;
    return cachedToken;
  }
  cachedToken = null;
  return null;
}

/** Call this on sign-out or 401 to force a fresh session fetch on the next request. */
export function clearTokenCache(): void {
  cachedToken      = null;
  tokenCacheExpiry = 0;
}

// ─────────────────────────────────────────────────────────────────────────────

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${API_BASE_URL}/api/v1`,
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
  });

  // Attach auth token — uses cached session to avoid per-request HTTP calls
  client.interceptors.request.use(async (config) => {
    const token = await getTokenCached();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  // Global error handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status  = error.response?.status;
      const message = error.response?.data?.detail ?? error.message;

      if (status === 401) {
        clearTokenCache();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }

      return Promise.reject({ statusCode: status, message });
    }
  );

  return client;
}

export const apiClient = createApiClient();

// ─── Generic CRUD helpers ─────────────────────────────────────────────────────

export async function apiGet<T>(
  url: string,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await apiClient.get<T>(url, { params });
  return response.data;
}

export async function apiPost<T>(
  url: string,
  data?: unknown
): Promise<T> {
  const response = await apiClient.post<T>(url, data);
  return response.data;
}

export async function apiPut<T>(
  url: string,
  data?: unknown
): Promise<T> {
  const response = await apiClient.put<T>(url, data);
  return response.data;
}

export async function apiPatch<T>(
  url: string,
  data?: unknown
): Promise<T> {
  const response = await apiClient.patch<T>(url, data);
  return response.data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const response = await apiClient.delete<T>(url);
  return response.data;
}

export async function apiDownloadFile(
  url: string,
  params?: Record<string, unknown>
): Promise<Blob> {
  const response = await apiClient.get(url, { params, responseType: "blob" });
  return response.data as Blob;
}

export async function apiUploadFile<T>(url: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<T>(url, formData);
  return response.data;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor    = document.createElement("a");
  anchor.href     = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}
