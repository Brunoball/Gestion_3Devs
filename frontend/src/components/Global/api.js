import { buildAuthHeaders, clearStoredSession } from "./session";

export async function fetchJSONAuth(url, options = {}, idOrganization = null) {
  const headers = buildAuthHeaders(options.headers || {}, idOrganization);
  const response = await fetch(url, { ...options, headers });
  const raw = await response.text();
  const trimmed = (raw || "").trim();

  let data = null;
  if (trimmed && !trimmed.startsWith("<")) {
    try {
      data = JSON.parse(trimmed);
    } catch {
      data = null;
    }
  }

  if (response.status === 401) {
    clearStoredSession();
    const error = new Error(data?.mensaje || "La sesión venció.");
    error.code = "SESSION_EXPIRED";
    throw error;
  }

  if (trimmed.startsWith("<")) {
    throw new Error("Backend devolvió HTML (error PHP). Revisá los logs del servidor.");
  }

  if (!response.ok || !data || data?.exito === false) {
    throw new Error(data?.mensaje || data?.error || `HTTP ${response.status}`);
  }

  return data;
}

export function authHeaders(extraHeaders = {}, idOrganization = null) {
  return buildAuthHeaders(extraHeaders, idOrganization);
}
