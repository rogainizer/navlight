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

If SMTP values are not set, booking creation still works and no email is sent.

## To Do
- Add admin features (optional)
- Add booking cancellation (optional)
