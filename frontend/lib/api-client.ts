import axios, { type AxiosInstance } from "axios";
import { getSession } from "next-auth/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${API_BASE_URL}/api/v1`,
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
  });

  // Attach auth token from NextAuth session
  client.interceptors.request.use(async (config) => {
    const session = await getSession();
    if (session?.user?.accessToken) {
      config.headers.Authorization = `Bearer ${session.user.accessToken}`;
    }
    return config;
  });

  // Global error handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status  = error.response?.status;
      const message = error.response?.data?.detail ?? error.message;

      if (status === 401) {
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
