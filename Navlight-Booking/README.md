# Navlight Booking Frontend

Vue 3 + Vite single-page app that manages Navlight equipment bookings. It talks to the Express backend in `../Navlight-Booking-Server`, which now persists data in MySQL.

## Architecture Overview
- **Frontend**: Vue 3 (script setup) compiled with Vite.
- **Backend**: Node/Express REST API (see sibling `Navlight-Booking-Server`).
- **Database**: MySQL 8 stores bookings instead of the legacy `bookings.json` file.

## Prerequisites (for local development)
- Node.js 20+
- npm 10+
- MySQL 8.x (local install or via Docker)
- A populated backend `.env` file (copy `Navlight-Booking-Server/.env.example`).

## Environment Variables
- Frontend uses `VITE_API_URL` to know where the backend lives.
  - Create `Navlight-Booking/.env.local` (ignored by git) and set `VITE_API_URL=http://localhost:3001` for local dev.
  - Docker builds pass `VITE_API_URL` as a build arg so the static bundle points to the in-cluster backend service.

## Local Development Workflow
1. **Provision MySQL**
  ```sql
  CREATE DATABASE IF NOT EXISTS navlight;
  CREATE USER IF NOT EXISTS 'navlight'@'%' IDENTIFIED BY 'navlight';
  GRANT ALL ON navlight.* TO 'navlight'@'%';
  FLUSH PRIVILEGES;
  ```
2. **Configure backend env**
  ```sh
  cd ../Navlight-Booking-Server
  cp .env.example .env   # edit SMTP + DB credentials as needed
  ```
3. **Start backend**
  ```sh
  npm install
  npm start
  ```
4. **Start frontend**
  ```sh
  cd ../Navlight-Booking
  npm install
  npm run dev -- --host 0.0.0.0
  ```
5. Visit http://localhost:5173 and ensure API calls hit the backend at `http://localhost:3001` (or whichever URL you configured in `VITE_API_URL`).

## Testing & Quality
- `npm run test:unit` – Vitest unit tests
- `npm run test:e2e` – Playwright end-to-end tests (run `npx playwright install` once)
- `npm run lint` – ESLint + Vue TS checks
- `npm run build` – Production build (`dist/`)

## Docker & Compose
Production-style containers live at the repo root:

```sh
docker compose up --build
```

This spins up:
- `db` – MySQL 8 with data persisted to the `db_data` Docker volume
- `backend` – `Navlight-Booking-Server` container on port 3001
- `frontend` – Static bundle served by NGINX on http://localhost:8080

Ensure `Navlight-Booking-Server/.env` exists before running compose (copy from `.env.example`). The compose file injects the DB host/user/password values automatically.

## Migrating Existing Data
The backend now stores bookings in MySQL. To migrate legacy `bookings.json` data, run a one-off Node script or SQL import that reads the JSON array and inserts each booking row via the REST API or directly into the `bookings` table (the Express server will create the table if it is missing).

## Deployment & Releases
- **Container images:** The GitHub workflow at `.github/workflows/build-and-publish.yml` builds both frontend and backend containers and publishes them to GHCR (`ghcr.io/<owner>/navlight-frontend` and `navlight-backend`). Set a repository variable `PUBLIC_API_URL` to the public API base (e.g. `https://navlight.rogainizer.com/api`) so the frontend bundle bakes in the correct URL.
- **Production compose file:** Use `docker-compose.prod.yml` with a secrets file at `deploy/.env.production` (see `deploy/.env.production.example`). Point `NAVLIGHT_NETWORK` to the external Docker network shared with Caddy and your existing MySQL container.
- **Droplet deployment script:** `scripts/deploy-droplet.sh` uploads the prod compose + env file to a droplet and runs `docker compose pull && docker compose up -d`. Before running, export `DROPLET_HOST`, `DROPLET_USER`, and optionally `REMOTE_PATH`, `COMPOSE_FILE`, `ENV_FILE`.
  ```bash
  export DROPLET_IP=navlight.example.com
  export DROPLET_USER=root
  export PUBLIC_API_URL=https://navlight.rogainizer.com/api
  pwsh ./dump-bookings.ps1   # optional backup
  bash scripts/deploy-droplet.sh
  ```
  The script expects passwordless SSH (use keys) and will prune dangling images after deployment.
- **CI-triggered deploy (optional):** The `deploy` job inside `.github/workflows/build-and-publish.yml` runs the same script whenever you manually dispatch the workflow and provide the necessary secrets (`DROPLET_IP`, `DROPLET_USER`, `DROPLET_SSH_KEY`, `DEPLOY_ENV_FILE`). Store the production `.env` contents in `DEPLOY_ENV_FILE`, and the workflow will append the freshly built image tags before pushing the compose stack to your droplet.
