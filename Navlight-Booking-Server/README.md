# Navlight Booking Backend

This Node.js backend provides REST API endpoints for booking Navlight sets. Bookings are stored in a bookings.json file.

## Features
- Create and list bookings
- Store booking details in bookings.json
- Basic validation
- CORS support for Vue frontend
- Optional booking confirmation emails via SMTP

## Endpoints
- `GET /bookings` — List all bookings
- `POST /bookings` — Create a new booking
- `GET /bookings/:id/invoice-preview` — Preview invoice details for a returned booking (admin token required)
- `GET /bookings/:id/invoice-pdf` — Download invoice PDF for a returned booking (admin token required)
- `POST /bookings/:id/send-invoice` — Send invoice email for a returned booking (admin token required)

## Setup
1. Run `npm install` to install dependencies
2. Start the server with `node server.js`

## Optional Email Configuration

To send a confirmation email to the person who makes a booking, set these environment variables:

- `SMTP_HOST` (example: `smtp.gmail.com`)
- `SMTP_PORT` (example: `587`)
- `SMTP_SECURE` (`true` for SSL/465, otherwise `false`)
- `SMTP_USER` (SMTP username/login)
- `SMTP_PASS` (SMTP password/app password)
- `EMAIL_FROM` (optional sender address; defaults to `SMTP_USER`)
- `BANK_ACCOUNT_NUMBER` (required to send invoice emails)
- `INVOICE_UNIT_CHARGE` (optional, defaults to `2` dollars per competitor)

If SMTP values are not set, booking creation still works and no email is sent.

## To Do
- Add admin features (optional)
- Add booking cancellation (optional)
