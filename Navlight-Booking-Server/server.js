
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
const missingPunchUnitCharge = process.env.MISSING_PUNCH_CHARGE
  ? Number(process.env.MISSING_PUNCH_CHARGE)
  : 200;
const bankAccountName = process.env.BANK_ACCOUNT_NAME || '';
const bankAccountNumber = process.env.BANK_ACCOUNT_NUMBER || '';
const financialControllerEmail = process.env.NAVLIGHT_FINANCIAL_CONTROLLER_EMAIL || '';

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
    `Pickup date: ${formatDisplayDate(booking.pickupDate)}`,
    `Event date: ${formatDisplayDate(booking.eventDate)}`,
    `Return date: ${formatDisplayDate(booking.returnDate)}`,
    '',
    'The charges will be calculated based on the number of competitors entered and any missing punches after the event.',
    `The charge per competitor is $${invoiceUnitCharge.toFixed(2)}, and any missing punch will incur a $${missingPunchUnitCharge.toFixed(2)} charge.`,
    'You will receive an invoice after the return date.',
    'Thank you.',
  ].join('\n');

  await emailTransporter.sendMail({
    from: emailFrom,
    to: booking.email,
    ...(financialControllerEmail ? { bcc: financialControllerEmail } : {}),
    subject,
    text,
  });
}

async function sendPickupConfirmationEmail(booking) {
  if (!emailTransporter || !emailFrom || !booking?.email) return;

  const missingPunches = Array.isArray(booking.pickupMissingPunches)
    ? booking.pickupMissingPunches.map(String).filter(Boolean)
    : [];

  const subject = `Navlight picked up: ${booking.eventName}`;
  const text = [
    `Hi ${booking.name},`,
    '',
    'Your Navlight pickup has been recorded.',
    '',
    `Event: ${booking.eventName}`,
    `Navlight set: ${booking.navlightSet}`,
    `Pickup date: ${formatDisplayDate(booking.pickupDate)}`,
    `Event date: ${formatDisplayDate(booking.eventDate)}`,
    `Return date: ${formatDisplayDate(booking.returnDate)}`,
    `Actual pickup date: ${formatDisplayDate(booking.actualPickupDate)}`,
    `Missing punches at pickup: ${missingPunches.join(', ') || 'None'}`,
    '',
    'The charges will be calculated based on the number of competitors entered and any missing punches after the event.',
    `The charge per competitor is $${invoiceUnitCharge.toFixed(2)}, and any missing punch will incur a $${missingPunchUnitCharge.toFixed(2)} charge.`,
    'You will receive an invoice after the return date.',
    'Thank you.',
  ].join('\n');

  await emailTransporter.sendMail({
    from: emailFrom,
    to: booking.email,
    ...(financialControllerEmail ? { bcc: financialControllerEmail } : {}),
    subject,
    text,
  });
}

function formatDisplayDate(value) {
  if (!value) return '';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = String(value.getFullYear());
    return `${day}/${month}/${year}`;
  }

  if (typeof value === 'string') {
    const datePart = value.includes('T') ? value.split('T')[0] : value;
    const [year, month, day] = datePart.split('-');
    if (year && month && day) {
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatDisplayDate(parsed);
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
  const returnedLostPunches = Array.isArray(booking.returnedLostPunches)
    ? booking.returnedLostPunches.map(String).filter(Boolean)
    : [];
  const missingPunchCharge = newMissingPunches.length * missingPunchUnitCharge;
  const totalCharge = usageCharge + missingPunchCharge;

  return {
    eventName: booking.eventName,
    eventDate: booking.eventDate,
    eventDateDisplay: formatDisplayDate(booking.eventDate),
    competitorsEntered: competitors,
    unitCharge: invoiceUnitCharge,
    usageCharge,
    newMissingPunches,
    returnedLostPunches,
    missingPunchUnitCharge,
    missingPunchCharge,
    totalCharge,
    bankAccountName,
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
    `Event name: ${invoice.eventName}`,
    `Event date: ${invoice.eventDateDisplay}`,
    `Usage charge: ${invoice.competitorsEntered} competitors × $${invoice.unitCharge.toFixed(2)} = $${invoice.usageCharge.toFixed(2)}`,
    `Missing returned punches charge: ${invoice.newMissingPunches.length} × $${invoice.missingPunchUnitCharge.toFixed(2)} = $${invoice.missingPunchCharge.toFixed(2)}`,
    `Missing punches: ${invoice.newMissingPunches.join(', ') || 'None'}`,
    `Lost punches (not charged): ${invoice.returnedLostPunches.join(', ') || 'None'}`,
    `Total charge: $${invoice.totalCharge.toFixed(2)}`,
    `Please pay the total amount to account ${invoice.bankAccountName || 'Not configured'} (${invoice.bankAccountNumber || 'Not configured'}) with reference \"${invoice.paymentReference}\".`,
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
    doc.fontSize(11).text(`Issued: ${formatDisplayDate(new Date())}`);
    doc.moveDown(1);

    doc.fontSize(12).text(`Name: ${booking.name}`);
    doc.text(`Email: ${booking.email}`);
    doc.moveDown(0.7);

    doc.text(`Event name: ${invoice.eventName}`);
    doc.text(`Event date: ${invoice.eventDateDisplay}`);
    doc.text(`Usage charge: ${invoice.competitorsEntered} competitors × $${invoice.unitCharge.toFixed(2)} = $${invoice.usageCharge.toFixed(2)}`);
    doc.text(`Missing punches charge: ${invoice.newMissingPunches.length} × $${invoice.missingPunchUnitCharge.toFixed(2)} = $${invoice.missingPunchCharge.toFixed(2)}`);
    doc.text(`   Missing punches: ${invoice.newMissingPunches.join(', ') || 'None'}`);
    doc.text(`   Lost punches (not charged): ${invoice.returnedLostPunches.join(', ') || 'None'}`);
    doc.text(`Total charge: $${invoice.totalCharge.toFixed(2)}`);
    doc.text(`Please pay to account ${invoice.bankAccountName || 'Not configured'} (${invoice.bankAccountNumber || 'Not configured'}) with reference "${invoice.paymentReference}".`);

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
  const { navlightSet, pickupDate, eventDate, returnDate, name, email, eventName, comment } = req.body;
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
    comment: comment || '',
    returnedLostPunches: [],
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
app.patch('/bookings/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found.' });

  const currentBooking = bookings[idx];
  const updatedBooking = {
    ...currentBooking,
    ...req.body,
  };

  updatedBooking.comment = req.body.comment ?? currentBooking.comment ?? '';
  delete updatedBooking.bookingComment;
  delete updatedBooking.pickupComment;
  delete updatedBooking.returnComment;

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

  const shouldSendPickupEmail = currentBooking.status !== 'pickedup' && updatedBooking.status === 'pickedup';

  bookings[idx] = updatedBooking;
  saveBookings(bookings);

  if (shouldSendPickupEmail) {
    try {
      await sendPickupConfirmationEmail(updatedBooking);
    } catch (error) {
      console.error('Failed to send pickup confirmation email:', error.message);
    }
  }

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
