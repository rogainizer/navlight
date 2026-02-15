// api/bookings.js
// Placeholder for API integration

export async function fetchBookings() {
  // TODO: Replace with real API call
  return [
    {
      id: 1,
      navlightSet: 'Set1',
      pickupDate: '2026-03-01',
      eventDate: '2026-03-02',
      returnDate: '2026-03-03',
      name: 'Alice',
      email: 'alice@example.com',
      eventName: 'Rogaine Night',
    },
    {
      id: 2,
      navlightSet: 'Set2',
      pickupDate: '2026-03-05',
      eventDate: '2026-03-06',
      returnDate: '2026-03-07',
      name: 'Bob',
      email: 'bob@example.com',
      eventName: 'Navlight Challenge',
    },
  ]
}

export async function createBooking(booking) {
  // TODO: Replace with real API call
  return { success: true, booking }
}
