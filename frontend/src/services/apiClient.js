const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `API Error: ${res.status}`);
    }
    return data.data !== undefined ? data.data : data;
  } catch (err) {
    console.error(`[API Request Error ${endpoint}]:`, err.message);
    throw err;
  }
}
