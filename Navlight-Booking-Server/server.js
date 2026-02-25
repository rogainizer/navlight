
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
  throw new Error('Database credentials (DB_USER, DB_PASSWORD, DB_NAME) must be provided via environment variables.');
}

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD must be set to secure admin endpoints.');
}

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

function parseBookingRow(row) {
  if (!row) return null;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  if (!data.id) {
    data.id = row.id;
  }
  return data;
}

async function getAllBookings() {
  const [rows] = await pool.query('SELECT data FROM bookings ORDER BY pickup_date');
  return rows.map(parseBookingRow);
}

async function findBookingById(id) {
  const [rows] = await pool.query('SELECT data FROM bookings WHERE id = ? LIMIT 1', [id]);
  return parseBookingRow(rows[0]);
}

async function insertBookingRecord(booking) {
  await pool.execute(
    `INSERT INTO bookings (id, navlight_set, pickup_date, event_date, return_date, status, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      booking.id,
      booking.navlightSet,
      booking.pickupDate,
      booking.eventDate,
      booking.returnDate,
      booking.status,
      JSON.stringify(booking),
    ],
  );
}

async function updateBookingRecord(booking) {
  await pool.execute(
    `UPDATE bookings
     SET navlight_set = ?, pickup_date = ?, event_date = ?, return_date = ?, status = ?, data = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      booking.navlightSet,
      booking.pickupDate,
      booking.eventDate,
      booking.returnDate,
      booking.status,
      JSON.stringify(booking),
      booking.id,
    ],
  );
}

async function deleteBookingRecord(id) {
  await pool.execute('DELETE FROM bookings WHERE id = ?', [id]);
}

async function hasDateConflict(navlightSet, pickupDate, returnDate, excludeId) {
  const params = [navlightSet, returnDate, pickupDate];
  let query =
    'SELECT 1 FROM bookings WHERE navlight_set = ? AND NOT (? < pickup_date OR ? > return_date)';
  if (excludeId) {
    query += ' AND id <> ?';
    params.push(excludeId);
  }
  query += ' LIMIT 1';
  const [rows] = await pool.query(query, params);
  return rows.length > 0;
}

async function ensureDatabaseConnection(retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      return;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await sleep(attempt * 500);
    }
  }
}

async function initializeDatabase() {
  await ensureDatabaseConnection();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGINT NOT NULL,
      navlight_set VARCHAR(64) NOT NULL,
      pickup_date DATE NOT NULL,
      event_date DATE NOT NULL,
      return_date DATE NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'booked',
      data JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_navlight_dates (navlight_set, pickup_date, return_date)
    )
  `);
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
app.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const bookings = await getAllBookings();
    res.json(bookings);
  }),
);

// POST /bookings
app.post('/bookings', asyncHandler(async (req, res) => {
  const { navlightSet, pickupDate, eventDate, returnDate, name, email, eventName, comment } = req.body;
  // Basic validation
  if (!navlightSet || !pickupDate || !eventDate || !returnDate || !name || !email || !eventName) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!(pickupDate <= eventDate && eventDate <= returnDate)) {
    return res.status(400).json({ error: 'Dates must be in order: Pickup ≤ Event ≤ Return.' });
  }
  const overlap = await hasDateConflict(navlightSet, pickupDate, returnDate);
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
  await insertBookingRecord(newBooking);

  try {
    await sendBookingConfirmationEmail(newBooking);
  } catch (error) {
    console.error('Failed to send booking confirmation email:', error.message);
  }

  res.status(201).json(newBooking);
}));


// PATCH /bookings/:id (update pickup/return info)
app.patch('/bookings/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const currentBooking = await findBookingById(id);
  if (!currentBooking) return res.status(404).json({ error: 'Booking not found.' });

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

  const overlap = await hasDateConflict(navlightSet, pickupDate, returnDate, id);

  if (overlap) {
    return res.status(409).json({ error: 'Navlight set is already booked for these dates.' });
  }

  const shouldSendPickupEmail = currentBooking.status !== 'pickedup' && updatedBooking.status === 'pickedup';

  await updateBookingRecord(updatedBooking);

  if (shouldSendPickupEmail) {
    try {
      await sendPickupConfirmationEmail(updatedBooking);
    } catch (error) {
      console.error('Failed to send pickup confirmation email:', error.message);
    }
  }

  res.json(updatedBooking);
}));

// DELETE /bookings/:id
app.delete('/bookings/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const booking = await findBookingById(id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  await deleteBookingRecord(id);
  res.status(204).end();
}));

// POST /bookings/:id/send-invoice
app.get('/bookings/:id/invoice-preview', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const booking = await findBookingById(id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (booking.status !== 'returned') {
    return res.status(400).json({ error: 'Invoice can only be created for returned bookings.' });
  }

  if (booking.competitorsEntered == null || booking.competitorsEntered === '') {
    return res.status(400).json({ error: 'Competitors entered is required before creating an invoice.' });
  }

  const invoice = buildInvoiceData(booking);
  return res.json({ invoice });
}));

// GET /bookings/:id/invoice-pdf
app.get('/bookings/:id/invoice-pdf', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const booking = await findBookingById(id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

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
}));

// POST /bookings/:id/send-invoice
app.post('/bookings/:id/send-invoice', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const booking = await findBookingById(id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (booking.status !== 'returned') {
    return res.status(400).json({ error: 'Invoice can only be created for returned bookings.' });
  }

  if (booking.competitorsEntered == null || booking.competitorsEntered === '') {
    return res.status(400).json({ error: 'Competitors entered is required before creating an invoice.' });
  }

  try {
    const invoice = await sendInvoiceEmail(booking);
    booking.invoiceSentAt = new Date().toISOString();
    await updateBookingRecord(booking);
    return res.json({ success: true, invoice });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to send invoice email.' });
  }
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Navlight Booking backend running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
