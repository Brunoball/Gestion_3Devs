const TOKEN_KEY = "token";
const USER_KEY = "usuario";
const ACTIVE_ORG_KEY = "organizacion_activa";

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function getOrganizations(user = getStoredUser()) {
  return Array.isArray(user?.organizaciones) ? user.organizaciones : [];
}

export function getStoredActiveOrganization(user = getStoredUser()) {
  const organizations = getOrganizations(user);
  if (!organizations.length) return null;

  let storedId = 0;
  try {
    storedId = Number(localStorage.getItem(ACTIVE_ORG_KEY) || 0);
  } catch {}

  const fromStorage = organizations.find(
    (org) => Number(org?.id_organizacion) === storedId
  );
  if (fromStorage) return fromStorage;

  const fromUser = organizations.find(
    (org) =>
      Number(org?.id_organizacion) ===
      Number(user?.organizacion_activa?.id_organizacion || 0)
  );
  if (fromUser) return fromUser;

  return organizations[0];
}

export function storeLoginResponse(data) {
  const token = String(data?.session_key || data?.token || "").trim();
  const user = data?.usuario && typeof data.usuario === "object" ? data.usuario : null;

  if (!token || !user) {
    throw new Error("La respuesta de inicio de sesión está incompleta.");
  }

  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  const active = getStoredActiveOrganization(user);
  if (active?.id_organizacion) {
    localStorage.setItem(ACTIVE_ORG_KEY, String(active.id_organizacion));
  }

  return { token, user, activeOrganization: active };
}

export function setStoredActiveOrganization(idOrganization) {
  const id = Number(idOrganization || 0);
  if (!id) return null;

  const user = getStoredUser();
  const organizations = getOrganizations(user);
  const selected = organizations.find(
    (org) => Number(org?.id_organizacion) === id
  );
  if (!selected) return null;

  localStorage.setItem(ACTIVE_ORG_KEY, String(id));
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({ ...user, organizacion_activa: selected })
  );

  return selected;
}

export function buildAuthHeaders(extraHeaders = {}, idOrganization = null) {
  const headers = { ...extraHeaders };
  const token = getStoredToken();
  const active = idOrganization
    ? { id_organizacion: Number(idOrganization) }
    : getStoredActiveOrganization();

  if (token) headers["X-Session"] = token;
  if (active?.id_organizacion) {
    headers["X-Organization"] = String(active.id_organizacion);
  }

  return headers;
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {}
}

export function normalizeRole(value) {
  const role = String(value || "vista").trim().toLowerCase();
  if (["admin", "administrator", "administrador", "superadmin", "1"].includes(role)) {
    return "admin";
  }
  if (["contador", "accountant"].includes(role)) return "contador";
  return "vista";
}
