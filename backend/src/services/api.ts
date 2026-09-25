// Central API service — all backend calls go through here

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// Store JWT token (use AsyncStorage in production)
let authToken: string | null = null;

export function setToken(token: string) { authToken = token; }
export function getToken() { return authToken; }
export function clearToken() { authToken = null; }

// Base fetch with auth header
async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

// ─── Auth ───────────────────────────────────
export const authAPI = {
  register: (data: any) => apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (email: string, password: string) => apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => apiFetch("/api/auth/me"),
  sendOTP: (phone: string) => apiFetch("/api/auth/send-otp", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOTP: (phone: string, code: string) => apiFetch("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, code }) }),
  updateProfile: (formData: FormData) => {
    // Special handling for file upload — no JSON content type
    return fetch(`${API_URL}/api/auth/profile`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${authToken}` },
      body: formData,
    }).then(r => r.json());
  },
};

// ─── Products ───────────────────────────────
export const productsAPI = {
  getAll: (params?: Record<string, any>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch(`/api/products${query}`);
  },
  getOne: (id: string) => apiFetch(`/api/products/${id}`),
  create: (formData: FormData) => {
    return fetch(`${API_URL}/api/products`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${authToken}` },
      body: formData, // FormData handles multipart automatically
    }).then(r => r.json());
  },
  update: (id: string, formData: FormData) => {
    return fetch(`${API_URL}/api/products/${id}`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${authToken}` },
      body: formData,
    }).then(r => r.json());
  },
  approve: (id: string) => apiFetch(`/api/products/${id}/approve`, { method: "POST" }),
};

// ─── Orders ─────────────────────────────────
export const ordersAPI = {
  create: (data: any) => apiFetch("/api/orders", { method: "POST", body: JSON.stringify(data) }),
  getMy: () => apiFetch("/api/orders/my"),
  getOne: (id: string) => apiFetch(`/api/orders/${id}`),
  updateStatus: (id: string, status: string) => apiFetch(`/api/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
};

// ─── Reviews ────────────────────────────────
export const reviewsAPI = {
  getForProduct: (productId: string) => apiFetch(`/api/reviews/${productId}`),
  create: (formData: FormData) => {
    return fetch(`${API_URL}/api/reviews`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${authToken}` },
      body: formData,
    }).then(r => r.json());
  },
  markHelpful: (id: string) => apiFetch(`/api/reviews/${id}/helpful`, { method: "POST" }),
};