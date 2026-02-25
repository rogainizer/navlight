# Navlight Booking Backend

Express REST API that powers the Navlight booking frontend. Booking data now lives in MySQL instead of `bookings.json`, and the server automatically provisions its schema on startup.

## Features
- Create, update, delete bookings with overlap protection
- Persist data in MySQL (`bookings` table, JSON payload per row)
- Admin token workflow for protected operations
- Invoice preview/PDF/email generation via nodemailer + PDFKit
- SMTP notifications for booking confirmations and pickups
- Ready-to-run Dockerfile + docker-compose stack (frontend + backend + MySQL)

## API Endpoints
- `POST /admin/login`
- `GET /bookings`
- `POST /bookings`
- `PATCH /bookings/:id`
- `DELETE /bookings/:id`
- `GET /bookings/:id/invoice-preview`
- `GET /bookings/:id/invoice-pdf`
- `POST /bookings/:id/send-invoice`

## Environment Variables
See `.env.example` for a complete list. Key values:

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `3001`) |
| `ADMIN_PASSWORD` | Simple shared secret for admin token issuance |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection info |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Mail transport |
| `NAVLIGHT_FINANCIAL_CONTROLLER_EMAIL` | Optional BCC for invoices |
| `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NUMBER` | Required for invoices |
| `INVOICE_UNIT_CHARGE`, `MISSING_PUNCH_CHARGE` | Pricing knobs |

Copy `.env.example` to `.env` and adjust values before running locally or via Docker.

## Local Setup
1. **Install dependencies**
	```sh
	npm install
	```
2. **Provision MySQL** (skip if you use docker-compose)
	```sql
	CREATE DATABASE IF NOT EXISTS navlight;
	CREATE USER IF NOT EXISTS 'navlight'@'%' IDENTIFIED BY 'navlight';
	GRANT ALL ON navlight.* TO 'navlight'@'%';
	FLUSH PRIVILEGES;
	```
3. **Configure `.env`** with DB + SMTP credentials.
4. **Run the server**
	```sh
	npm start
	```
	The server will create the `bookings` table automatically if it does not exist.

## Docker & Compose
The repository root contains `docker-compose.yml`, which launches MySQL, this backend, and the Vue frontend in one command:

```sh
docker compose up --build
```

- Backend is exposed on http://localhost:3001
- Frontend is served on http://localhost:8080
- Database data persists in the `db_data` Docker volume

Ensure `Navlight-Booking-Server/.env` exists before running compose; sensitive SMTP credentials stay out of the compose file and are loaded at runtime.

## Migrating Legacy JSON Data
If you previously relied on `bookings.json`, run a temporary Node script that reads the JSON array and POSTs each booking to `POST /bookings` (or inserts rows directly into MySQL). Once imported, the flat file is no longer consulted by the server.

## Email Configuration Notes
SMTP settings are optional. Booking creation and updates still work without them, but the server will skip confirmation/invoice emails when the transporter is not configured. Invoices also require `BANK_ACCOUNT_NUMBER`; without it the PDF/email endpoints return an error.
