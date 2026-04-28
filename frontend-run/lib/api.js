const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const apiBaseUrl = API_BASE_URL;

function apiUrl(path) {
  if (!API_BASE_URL) {
    throw new ApiError('NEXT_PUBLIC_API_BASE_URL is not configured. Create frontend/.env.local from .env.example.', 500);
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return `${API_BASE_URL}${cleanPath.slice(4)}`;
  }

  return `${API_BASE_URL}${cleanPath}`;
}

export async function apiFetch(path, { token, method = 'GET', body, headers = {} } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
      cache: 'no-store'
    });
  } catch (error) {
    throw new ApiError(`Backend is not reachable at ${API_BASE_URL}. Start the backend with npm run dev:local.`, 0, error.message);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok || payload?.success === false) {
    throw new ApiError(payload?.message || 'Request failed', response.status, payload?.details);
  }

  return payload;
}

export async function login(email, password) {
  const payload = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: { email, password }
  });
  return payload.data;
}

export async function fetchDashboardBundle(token) {
  const [
    summary,
    riskDistribution,
    platformDetections,
    timeline,
    assets,
    detections,
    accounts,
    fragments,
    propagation,
    mutations,
    evidence,
    reviews
  ] = await Promise.all([
    apiFetch('/api/dashboard/summary', { token }),
    apiFetch('/api/dashboard/risk-distribution', { token }),
    apiFetch('/api/dashboard/platform-detections', { token }),
    apiFetch('/api/dashboard/timeline', { token }),
    apiFetch('/api/assets?limit=50', { token }),
    apiFetch('/api/matching/results?limit=50', { token }),
    apiFetch('/api/accounts/intelligence?limit=50', { token }),
    apiFetch('/api/fragments?limit=50', { token }),
    apiFetch('/api/propagation?limit=50', { token }),
    apiFetch('/api/mutations?limit=50', { token }),
    apiFetch('/api/evidence?limit=50', { token }),
    apiFetch('/api/reviews?limit=50', { token })
  ]);

  return {
    summary: summary.data,
    riskDistribution: riskDistribution.data,
    platformDetections: platformDetections.data,
    timeline: timeline.data,
    assets: assets.data,
    detections: detections.data,
    accounts: accounts.data,
    fragments: fragments.data,
    propagation: propagation.data,
    mutations: mutations.data,
    evidence: evidence.data,
    reviews: reviews.data
  };
}
