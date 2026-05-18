
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const api = express.Router();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME || 'navlight';

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
  throw new Error('Database credentials (DB_USER, DB_PASSWORD, DB_NAME) must be provided via environment variables.');
}

console.log(`Connecting to database at ${DB_HOST}:${DB_PORT} as ${DB_USER} for ${DB_NAME} with password ${DB_PASSWORD}`);
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
const configuredCcEmail = process.env.EMAIL_CC || '';
const resendApiKey = process.env.RESEND_API_KEY || '';
const invoiceUnitCharge = process.env.INVOICE_UNIT_CHARGE
  ? Number(process.env.INVOICE_UNIT_CHARGE)
  : 2;
const missingPunchUnitCharge = process.env.MISSING_PUNCH_CHARGE
  ? Number(process.env.MISSING_PUNCH_CHARGE)
  : 200;
const bankAccountName = process.env.BANK_ACCOUNT_NAME || '';
const bankAccountNumber = process.env.BANK_ACCOUNT_NUMBER || '';
const financialControllerEmail = process.env.NAVLIGHT_FINANCIAL_CONTROLLER_EMAIL || '';
const auditBccEmail = 'rogainizer.nz@gmail.com';

function buildBcc(...emails) {
  const list = emails.map((email) => String(email || '').trim()).filter(Boolean);
  return [...new Set(list)].join(', ');
}

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
const resendClient = resendApiKey ? new Resend(resendApiKey) : null;
const hasEmailSender = Boolean(emailFrom && (resendClient || emailTransporter));

function parseRecipients(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeRecipients(...values) {
  return [...new Set(values.flatMap(parseRecipients))];
}

async function sendEmail({ to, cc, bcc, subject, text }) {
  if (!emailFrom) {
    throw new Error('Email is not configured: EMAIL_FROM is missing.');
  }

  const toRecipients = parseRecipients(to);
  const ccRecipients = mergeRecipients(configuredCcEmail, cc);
  const bccRecipients = parseRecipients(bcc);

  if (resendClient) {
    const result = await resendClient.emails.send({
      from: emailFrom,
      to: toRecipients,
      ...(ccRecipients.length ? { cc: ccRecipients } : {}),
      ...(bccRecipients.length ? { bcc: bccRecipients } : {}),
      subject,
      text,
    });

    if (result?.error) {
      const resendMessage =
        typeof result.error === 'string'
          ? result.error
          : result.error.message || JSON.stringify(result.error);
      throw new Error(`Resend email send failed: ${resendMessage}`);
    }

    if (result?.data?.id) {
      console.log(`Resend email queued with id ${result.data.id} for ${toRecipients.join(', ')}`);
    }

    return;
  }

  if (emailTransporter) {
    await emailTransporter.sendMail({
      from: emailFrom,
      to: toRecipients.join(', '),
      ...(ccRecipients.length ? { cc: ccRecipients.join(', ') } : {}),
      ...(bccRecipients.length ? { bcc: bccRecipients.join(', ') } : {}),
      subject,
      text,
    });
    return;
  }

  throw new Error('Email is not configured: set RESEND_API_KEY or SMTP settings.');
}

// Simple admin password (in production, use env var and HTTPS)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD must be set to secure admin endpoints.');
}

// In-memory token store (for demo; use sessions/DB for production)
const adminTokens = new Set();

// POST /admin/login
api.post('/admin/login', (req, res) => {
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

function parsePunchIssueRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    set: row.navlight_set,
    punch: row.punch,
    issue: row.issue,
    resolution: row.resolution || '',
    status: row.status,
    dateOpened: row.date_opened,
    dateResolved: row.date_resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function currentDateString() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeOptionalDate(value) {
  if (value == null) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { error: 'Dates must use YYYY-MM-DD format.' };
  }

  return trimmed;
}

async function getAllPunchIssues() {
  const [rows] = await pool.query(`
    SELECT id, navlight_set, punch, issue, resolution, status, date_opened, date_resolved, created_at, updated_at
    FROM punch_issues
    ORDER BY status = 'resolved', date_opened DESC, updated_at DESC, id DESC
  `);
  return rows.map(parsePunchIssueRow);
}

async function createPunchIssueRecord(issue) {
  const [result] = await pool.execute(
    `INSERT INTO punch_issues (navlight_set, punch, issue, resolution, status, date_opened, date_resolved)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [issue.set, issue.punch, issue.issue, issue.resolution || '', issue.status, issue.dateOpened, issue.dateResolved],
  );

  const [rows] = await pool.query(
    `SELECT id, navlight_set, punch, issue, resolution, status, date_opened, date_resolved, created_at, updated_at
     FROM punch_issues
     WHERE id = ?
     LIMIT 1`,
    [result.insertId],
  );

  return parsePunchIssueRow(rows[0]);
}

async function updatePunchIssueRecord(id, issue) {
  await pool.execute(
    `UPDATE punch_issues
     SET navlight_set = ?, punch = ?, issue = ?, resolution = ?, status = ?, date_opened = ?, date_resolved = ?, updated_at = NOW()
     WHERE id = ?`,
    [issue.set, issue.punch, issue.issue, issue.resolution || '', issue.status, issue.dateOpened, issue.dateResolved, id],
  );

  const [rows] = await pool.query(
    `SELECT id, navlight_set, punch, issue, resolution, status, date_opened, date_resolved, created_at, updated_at
     FROM punch_issues
     WHERE id = ?
     LIMIT 1`,
    [id],
  );

  return parsePunchIssueRow(rows[0]);
}

async function findPunchIssueById(id) {
  const [rows] = await pool.query(
    `SELECT id, navlight_set, punch, issue, resolution, status, date_opened, date_resolved, created_at, updated_at
     FROM punch_issues
     WHERE id = ?
     LIMIT 1`,
    [id],
  );

  return parsePunchIssueRow(rows[0]);
}

async function deletePunchIssueRecord(id) {
  await pool.execute('DELETE FROM punch_issues WHERE id = ?', [id]);
}

function normalizePunchIssuePayload(payload, currentIssue) {
  const normalizedOpenedDate = normalizeOptionalDate(payload?.dateOpened ?? currentIssue?.dateOpened ?? null);
  if (normalizedOpenedDate && typeof normalizedOpenedDate === 'object' && normalizedOpenedDate.error) {
    return normalizedOpenedDate;
  }

  const normalizedResolvedDate = normalizeOptionalDate(payload?.dateResolved ?? currentIssue?.dateResolved ?? null);
  if (normalizedResolvedDate && typeof normalizedResolvedDate === 'object' && normalizedResolvedDate.error) {
    return normalizedResolvedDate;
  }

  const normalized = {
    set: String(payload?.set ?? currentIssue?.set ?? '').trim(),
    punch: String(payload?.punch ?? currentIssue?.punch ?? '').trim(),
    issue: String(payload?.issue ?? currentIssue?.issue ?? '').trim(),
    resolution: String(payload?.resolution ?? currentIssue?.resolution ?? '').trim(),
    status: String(payload?.status ?? currentIssue?.status ?? 'open').trim().toLowerCase(),
    dateOpened: normalizedOpenedDate || currentDateString(),
    dateResolved: normalizedResolvedDate,
  };

  if (!normalized.set || !normalized.punch || !normalized.issue) {
    return { error: 'Set, punch, and issue are required.' };
  }

  if (!['open', 'resolved'].includes(normalized.status)) {
    return { error: 'Status must be either open or resolved.' };
  }

  if (normalized.status === 'resolved') {
    normalized.dateResolved = normalized.dateResolved || currentDateString();
  } else {
    normalized.dateResolved = null;
  }

  return { value: normalized };
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

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS punch_issues (
      id BIGINT NOT NULL AUTO_INCREMENT,
      navlight_set VARCHAR(64) NOT NULL,
      punch VARCHAR(64) NOT NULL,
      issue TEXT NOT NULL,
      resolution TEXT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'open',
      date_opened DATE NOT NULL DEFAULT (CURRENT_DATE),
      date_resolved DATE NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_punch_issues_status (status, updated_at),
      KEY idx_punch_issues_set_punch (navlight_set, punch)
    )
  `);
}

async function sendBookingConfirmationEmail(booking) {
  if (!hasEmailSender || !booking?.email) return;

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
    'The cost of couriering the set to/from the event is paid by the event organizer.',
    'You will receive an invoice after the return date.',
    'Thank you.',
  ].join('\n');

  await sendEmail({
    to: booking.email,
    bcc: buildBcc(auditBccEmail),
    subject,
    text,
  });
}

async function sendPickupConfirmationEmail(booking) {
  if (!hasEmailSender || !booking?.email) return;

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

  await sendEmail({
    to: booking.email,
    bcc: buildBcc(auditBccEmail),
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
  const courierCost = Number(booking.courierCost || 0);
  const newMissingPunches = calculateNewMissingReturnedPunches(booking);
  const returnedLostPunches = Array.isArray(booking.returnedLostPunches)
    ? booking.returnedLostPunches.map(String).filter(Boolean)
    : [];
  const missingPunchCharge = newMissingPunches.length * missingPunchUnitCharge;
  const totalCharge = usageCharge + missingPunchCharge + courierCost;

  return {
    eventName: booking.eventName,
    eventDate: booking.eventDate,
    eventDateDisplay: formatDisplayDate(booking.eventDate),
    competitorsEntered: competitors,
    unitCharge: invoiceUnitCharge,
    usageCharge,
    courierCost,
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
    `Courier cost: $${invoice.courierCost.toFixed(2)}`,
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
    doc.text(`Courier cost: $${invoice.courierCost.toFixed(2)}`);
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
  if (!hasEmailSender || !booking?.email) {
    throw new Error('Email is not configured or recipient email is missing.');
  }

  if (!bankAccountNumber) {
    throw new Error('BANK_ACCOUNT_NUMBER environment variable is not set.');
  }

  const invoice = buildInvoiceData(booking);

  const subject = `Invoice for Navlight booking: ${booking.eventName}`;
  const text = createInvoiceEmailText(booking, invoice);

  await sendEmail({
    to: booking.email,
    bcc: buildBcc(auditBccEmail, financialControllerEmail),
    subject,
    text,
  });

  return invoice;
}

// GET /bookings
api.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const bookings = await getAllBookings();
    res.json(bookings);
  }),
);

// POST /bookings
api.post('/bookings', asyncHandler(async (req, res) => {
  const { navlightSet, pickupDate, eventDate, returnDate, name, email, eventName, comment, estimatedNumberOfTags } = req.body;
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
    estimatedNumberOfTags: estimatedNumberOfTags || '',
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
api.patch('/bookings/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const currentBooking = await findBookingById(id);
  if (!currentBooking) return res.status(404).json({ error: 'Booking not found.' });

  const updatedBooking = {
    ...currentBooking,
    ...req.body,
  };

  updatedBooking.comment = req.body.comment ?? currentBooking.comment ?? '';
  updatedBooking.estimatedNumberOfTags = req.body.estimatedNumberOfTags ?? currentBooking.estimatedNumberOfTags ?? '';
  updatedBooking.courierCost = req.body.courierCost == null ? Number(currentBooking.courierCost || 0) : Number(req.body.courierCost);
  delete updatedBooking.bookingComment;
  delete updatedBooking.pickupComment;
  delete updatedBooking.returnComment;

  if (!Number.isFinite(updatedBooking.courierCost) || updatedBooking.courierCost < 0) {
    return res.status(400).json({ error: 'Courier cost must be a non-negative number.' });
  }

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
api.delete('/bookings/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const booking = await findBookingById(id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  await deleteBookingRecord(id);
  res.status(204).end();
}));

// POST /bookings/:id/send-invoice
api.get('/bookings/:id/invoice-preview', requireAdmin, asyncHandler(async (req, res) => {
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
api.get('/bookings/:id/invoice-pdf', requireAdmin, asyncHandler(async (req, res) => {
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
api.post('/bookings/:id/send-invoice', requireAdmin, asyncHandler(async (req, res) => {
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

// GET /punch-issues
api.get('/punch-issues', requireAdmin, asyncHandler(async (req, res) => {
  const issues = await getAllPunchIssues();
  res.json(issues);
}));

// POST /punch-issues
api.post('/punch-issues', requireAdmin, asyncHandler(async (req, res) => {
  const { value, error } = normalizePunchIssuePayload(req.body);

  if (error) {
    return res.status(400).json({ error });
  }

  const issue = await createPunchIssueRecord(value);
  return res.status(201).json(issue);
}));

// PATCH /punch-issues/:id
api.patch('/punch-issues/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const currentIssue = await findPunchIssueById(id);

  if (!currentIssue) {
    return res.status(404).json({ error: 'Punch issue not found.' });
  }

  const { value, error } = normalizePunchIssuePayload(req.body, currentIssue);

  if (error) {
    return res.status(400).json({ error });
  }

  const issue = await updatePunchIssueRecord(id, value);
  return res.json(issue);
}));

// DELETE /punch-issues/:id
api.delete('/punch-issues/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const currentIssue = await findPunchIssueById(id);

  if (!currentIssue) {
    return res.status(404).json({ error: 'Punch issue not found.' });
  }

  await deletePunchIssueRecord(id);
  return res.status(204).end();
}));

app.use('/api', api);

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
