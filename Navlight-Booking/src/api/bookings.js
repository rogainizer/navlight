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
