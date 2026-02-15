export async function adminLogin(password) {
  const res = await fetch(`${API_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Login failed');
  }
  return await res.json();
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
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update booking');
  }
  return await res.json();
}

export async function deleteBooking(id, adminToken) {
  const res = await fetch(`${API_URL}/bookings/${id}`, {
    method: 'DELETE',
    headers: adminToken ? { 'x-admin-token': adminToken } : {},
  });
  if (!res.ok && res.status !== 204) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete booking');
  }
}

export async function sendInvoice(id, adminToken) {
  const res = await fetch(`${API_URL}/bookings/${id}/send-invoice`, {
    method: 'POST',
    headers: adminToken ? { 'x-admin-token': adminToken } : {},
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to send invoice');
  }
  return await res.json();
}

export async function fetchInvoicePreview(id, adminToken) {
  const res = await fetch(`${API_URL}/bookings/${id}/invoice-preview`, {
    method: 'GET',
    headers: adminToken ? { 'x-admin-token': adminToken } : {},
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to load invoice preview');
  }
  return await res.json();
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
      // keep default message
    }
    throw new Error(errorMessage);
  }
  return await res.blob();
}
// api/bookings.js
// Placeholder for API integration

const API_URL = 'http://localhost:3001';

export async function fetchBookings() {
  const res = await fetch(`${API_URL}/bookings`);
  if (!res.ok) throw new Error('Failed to fetch bookings');
  return await res.json();
}

export async function createBooking(booking) {
  const res = await fetch(`${API_URL}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(booking),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create booking');
  }
  return await res.json();
}
