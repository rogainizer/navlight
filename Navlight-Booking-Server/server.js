
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');

app.use(cors());
app.use(express.json());

// Simple admin password (in production, use env var and HTTPS)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'navlightadmin';

// In-memory token store (for demo; use sessions/DB for production)
const adminTokens = new Set();

// POST /admin/login
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    // Issue a simple token
    const token = Math.random().toString(36).slice(2) + Date.now();
    adminTokens.add(token);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Middleware to check admin token
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (adminTokens.has(token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Helper: Load bookings
function loadBookings() {
  if (!fs.existsSync(BOOKINGS_FILE)) return [];
  const data = fs.readFileSync(BOOKINGS_FILE);
  return JSON.parse(data);
}

// Helper: Save bookings
function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// GET /bookings
app.get('/bookings', (req, res) => {
  const bookings = loadBookings();
  res.json(bookings);
});

// POST /bookings
app.post('/bookings', (req, res) => {
  const { navlightSet, pickupDate, eventDate, returnDate, name, email, eventName } = req.body;
  // Basic validation
  if (!navlightSet || !pickupDate || !eventDate || !returnDate || !name || !email || !eventName) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!(pickupDate <= eventDate && eventDate <= returnDate)) {
    return res.status(400).json({ error: 'Dates must be in order: Pickup ≤ Event ≤ Return.' });
  }
  // Prevent overlapping bookings for same set
  const bookings = loadBookings();
  const overlap = bookings.some(b =>
    b.navlightSet === navlightSet &&
    !(returnDate < b.pickupDate || pickupDate > b.returnDate)
  );
  if (overlap) {
    return res.status(409).json({ error: 'Navlight set is already booked for these dates.' });
  }
  const newBooking = {
    id: Date.now(),
    navlightSet,
    pickupDate,
    eventDate,
    returnDate,
    name,
    email,
    eventName,
    status: 'booked',
  };
  bookings.push(newBooking);
  saveBookings(bookings);
  res.status(201).json(newBooking);
});


// PATCH /bookings/:id (update pickup/return info)
app.patch('/bookings/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found.' });

  const currentBooking = bookings[idx];
  const updatedBooking = {
    ...currentBooking,
    ...req.body,
  };

  const { navlightSet, pickupDate, eventDate, returnDate, name, email, eventName } = updatedBooking;

  if (!navlightSet || !pickupDate || !eventDate || !returnDate || !name || !email || !eventName) {
    return res.status(400).json({ error: 'All core booking fields are required.' });
  }

  if (!(pickupDate <= eventDate && eventDate <= returnDate)) {
    return res.status(400).json({ error: 'Dates must be in order: Pickup ≤ Event ≤ Return.' });
  }

  const overlap = bookings.some(b =>
    b.id !== id &&
    b.navlightSet === navlightSet &&
    !(returnDate < b.pickupDate || pickupDate > b.returnDate)
  );

  if (overlap) {
    return res.status(409).json({ error: 'Navlight set is already booked for these dates.' });
  }

  bookings[idx] = updatedBooking;
  saveBookings(bookings);
  res.json(updatedBooking);
});

// DELETE /bookings/:id
app.delete('/bookings/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  let bookings = loadBookings();
  const idx = bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found.' });
  bookings = bookings.filter(b => b.id !== id);
  saveBookings(bookings);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Navlight Booking backend running on port ${PORT}`);
});
