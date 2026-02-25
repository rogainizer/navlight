const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error('VITE_API_URL is not defined. Set it in your environment before building the frontend.');
}

async function parseJsonResponse(res, defaultMessage) {
  if (!res.ok) {
    let message = defaultMessage;
    try {
      const error = await res.json();
      message = error.error || message;
    } catch {
      // Ignore JSON parse errors and keep default message
    }
    throw new Error(message);
  }
  return res.json();
}

async function ensureSuccess(res, defaultMessage) {
  if (!res.ok) {
    let message = defaultMessage;
    try {
      const error = await res.json();
      message = error.error || message;
    } catch {
      // Ignore JSON parse errors and keep default message
    }
    throw new Error(message);
  }
}

export async function adminLogin(password) {
  const res = await fetch(`${API_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return parseJsonResponse(res, 'Login failed');
}

export async function updateBooking(id, updates, adminToken) {
  const res = await fetch(`${API_URL}/bookings/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { 'x-admin-token': adminToken } : {}),
    },
    body: JSON.stringify(updates),
  });
  return parseJsonResponse(res, 'Failed to update booking');
}

export async function deleteBooking(id, adminToken) {
  const res = await fetch(`${API_URL}/bookings/${id}`, {
    method: 'DELETE',
    headers: adminToken ? { 'x-admin-token': adminToken } : {},
  });
  await ensureSuccess(res, 'Failed to delete booking');
}

export async function sendInvoice(id, adminToken) {
  const res = await fetch(`${API_URL}/bookings/${id}/send-invoice`, {
    method: 'POST',
    headers: adminToken ? { 'x-admin-token': adminToken } : {},
  });
  return parseJsonResponse(res, 'Failed to send invoice');
}

export async function fetchInvoicePreview(id, adminToken) {
  const res = await fetch(`${API_URL}/bookings/${id}/invoice-preview`, {
    method: 'GET',
    headers: adminToken ? { 'x-admin-token': adminToken } : {},
  });
  return parseJsonResponse(res, 'Failed to load invoice preview');
}

export async function fetchInvoicePdf(id, adminToken) {
  const res = await fetch(`${API_URL}/bookings/${id}/invoice-pdf`, {
    method: 'GET',
    headers: adminToken ? { 'x-admin-token': adminToken } : {},
  });
  if (!res.ok) {
    let errorMessage = 'Failed to download invoice PDF';
    try {
      const error = await res.json();
      errorMessage = error.error || errorMessage;
    } catch {
      // Keep default message
    }
    throw new Error(errorMessage);
  }
  return res.blob();
}

export async function fetchBookings() {
  const res = await fetch(`${API_URL}/bookings`);
  return parseJsonResponse(res, 'Failed to fetch bookings');
}

export async function createBooking(booking) {
  const res = await fetch(`${API_URL}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(booking),
  });
  return parseJsonResponse(res, 'Failed to create booking');
}
