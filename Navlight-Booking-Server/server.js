const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');

app.use(cors());
app.use(express.json());

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
    status: 'confirmed',
  };
  bookings.push(newBooking);
  saveBookings(bookings);
  res.status(201).json(newBooking);
});

app.listen(PORT, () => {
  console.log(`Navlight Booking backend running on port ${PORT}`);
});
