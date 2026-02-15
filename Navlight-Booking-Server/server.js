
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
const PORT = 3001;
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');

app.use(cors());
app.use(express.json());

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const emailFrom = process.env.EMAIL_FROM || smtpUser;
const invoiceUnitCharge = process.env.INVOICE_UNIT_CHARGE
  ? Number(process.env.INVOICE_UNIT_CHARGE)
  : 2;
const bankAccountNumber = process.env.BANK_ACCOUNT_NUMBER || '';

const emailTransporter = smtpHost && smtpUser && smtpPass
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : null;

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

async function sendBookingConfirmationEmail(booking) {
  if (!emailTransporter || !emailFrom || !booking?.email) return;

  const subject = `Navlight booking confirmed: ${booking.eventName}`;
  const text = [
    `Hi ${booking.name},`,
    '',
    'Your Navlight booking has been confirmed.',
    '',
    `Event: ${booking.eventName}`,
    `Navlight set: ${booking.navlightSet}`,
    `Pickup date: ${booking.pickupDate}`,
    `Event date: ${booking.eventDate}`,
    `Return date: ${booking.returnDate}`,
    '',
    'Thank you.',
  ].join('\n');

  await emailTransporter.sendMail({
    from: emailFrom,
    to: booking.email,
    subject,
    text,
  });
}

function formatDisplayDate(value) {
  if (!value || typeof value !== 'string') return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function calculateNewMissingReturnedPunches(booking) {
  const pickupMissing = Array.isArray(booking.pickupMissingPunches)
    ? booking.pickupMissingPunches.map(String)
    : [];
  const returnMissing = Array.isArray(booking.returnMissingPunches)
    ? booking.returnMissingPunches.map(String)
    : [];

  return returnMissing.filter((punch) => !pickupMissing.includes(punch));
}

function buildInvoiceData(booking) {
  const competitors = Number(booking.competitorsEntered || 0);
  const usageCharge = competitors * invoiceUnitCharge;
  const newMissingPunches = calculateNewMissingReturnedPunches(booking);
  const missingPunchCharge = newMissingPunches.length * 200;
  const totalCharge = usageCharge + missingPunchCharge;

  return {
    eventName: booking.eventName,
    eventDate: booking.eventDate,
    eventDateDisplay: formatDisplayDate(booking.eventDate),
    competitorsEntered: competitors,
    unitCharge: invoiceUnitCharge,
    usageCharge,
    newMissingPunches,
    missingPunchCharge,
    totalCharge,
    bankAccountNumber,
    paymentReference: booking.eventName,
  };
}

function createInvoiceEmailText(booking, invoice) {
  return [
    `Hi ${booking.name},`,
    '',
    'Please find your Navlight booking invoice details below:',
    '',
    `1. Event name: ${invoice.eventName}`,
    `2. Event date: ${invoice.eventDateDisplay}`,
    `3. Usage charge: ${invoice.competitorsEntered} competitors × $${invoice.unitCharge.toFixed(2)} = $${invoice.usageCharge.toFixed(2)}`,
    `4. Missing returned punches charge: ${invoice.newMissingPunches.length} × $200.00 = $${invoice.missingPunchCharge.toFixed(2)}`,
    `   Newly missing punches: ${invoice.newMissingPunches.join(', ') || 'None'}`,
    `5. Total charge: $${invoice.totalCharge.toFixed(2)}`,
    `6. Please pay the total amount to bank account ${invoice.bankAccountNumber} with reference \"${invoice.paymentReference}\".`,
    '',
    'Thank you.',
  ].join('\n');
}

function buildInvoicePdfBuffer(booking, invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Navlight Booking Invoice', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Issued: ${new Date().toLocaleDateString('en-GB')}`);
    doc.moveDown(1);

    doc.fontSize(12).text(`Name: ${booking.name}`);
    doc.text(`Email: ${booking.email}`);
    doc.moveDown(0.7);

    doc.text(`1. Event name: ${invoice.eventName}`);
    doc.text(`2. Event date: ${invoice.eventDateDisplay}`);
    doc.text(`3. Usage charge: ${invoice.competitorsEntered} competitors × $${invoice.unitCharge.toFixed(2)} = $${invoice.usageCharge.toFixed(2)}`);
    doc.text(`4. Missing returned punches charge: ${invoice.newMissingPunches.length} × $200.00 = $${invoice.missingPunchCharge.toFixed(2)}`);
    doc.text(`   Newly missing punches: ${invoice.newMissingPunches.join(', ') || 'None'}`);
    doc.text(`5. Total charge: $${invoice.totalCharge.toFixed(2)}`);
    doc.text(`6. Please pay to bank account ${invoice.bankAccountNumber} with reference "${invoice.paymentReference}".`);

    doc.moveDown(1);
    doc.text('Thank you.');

    doc.end();
  });
}

async function sendInvoiceEmail(booking) {
  if (!emailTransporter || !emailFrom || !booking?.email) {
    throw new Error('Email is not configured or recipient email is missing.');
  }

  if (!bankAccountNumber) {
    throw new Error('BANK_ACCOUNT_NUMBER environment variable is not set.');
  }

  const invoice = buildInvoiceData(booking);

  const subject = `Invoice for Navlight booking: ${booking.eventName}`;
  const text = createInvoiceEmailText(booking, invoice);

  await emailTransporter.sendMail({
    from: emailFrom,
    to: booking.email,
    subject,
    text,
  });

  return invoice;
}

// GET /bookings
app.get('/bookings', (req, res) => {
  const bookings = loadBookings();
  res.json(bookings);
});

// POST /bookings
app.post('/bookings', async (req, res) => {
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

  try {
    await sendBookingConfirmationEmail(newBooking);
  } catch (error) {
    console.error('Failed to send booking confirmation email:', error.message);
  }

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

// POST /bookings/:id/send-invoice
app.get('/bookings/:id/invoice-preview', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const booking = bookings[idx];

  if (booking.status !== 'returned') {
    return res.status(400).json({ error: 'Invoice can only be created for returned bookings.' });
  }

  if (booking.competitorsEntered == null || booking.competitorsEntered === '') {
    return res.status(400).json({ error: 'Competitors entered is required before creating an invoice.' });
  }

  const invoice = buildInvoiceData(booking);
  return res.json({ invoice });
});

// GET /bookings/:id/invoice-pdf
app.get('/bookings/:id/invoice-pdf', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const booking = bookings[idx];

  if (booking.status !== 'returned') {
    return res.status(400).json({ error: 'Invoice can only be created for returned bookings.' });
  }

  if (booking.competitorsEntered == null || booking.competitorsEntered === '') {
    return res.status(400).json({ error: 'Competitors entered is required before creating an invoice.' });
  }

  if (!bankAccountNumber) {
    return res.status(400).json({ error: 'BANK_ACCOUNT_NUMBER environment variable is not set.' });
  }

  try {
    const invoice = buildInvoiceData(booking);
    const pdfBuffer = await buildInvoicePdfBuffer(booking, invoice);
    const safeEventName = String(booking.eventName || 'invoice').replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `invoice-${safeEventName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate invoice PDF.' });
  }
});

// POST /bookings/:id/send-invoice
app.post('/bookings/:id/send-invoice', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const booking = bookings[idx];

  if (booking.status !== 'returned') {
    return res.status(400).json({ error: 'Invoice can only be created for returned bookings.' });
  }

  if (booking.competitorsEntered == null || booking.competitorsEntered === '') {
    return res.status(400).json({ error: 'Competitors entered is required before creating an invoice.' });
  }

  try {
    const invoice = await sendInvoiceEmail(booking);
    booking.invoiceSentAt = new Date().toISOString();
    bookings[idx] = booking;
    saveBookings(bookings);
    return res.json({ success: true, invoice });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to send invoice email.' });
  }
});

app.listen(PORT, () => {
  console.log(`Navlight Booking backend running on port ${PORT}`);
});
