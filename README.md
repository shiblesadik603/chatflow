# ChatFlow

A real-time chat application (private chat, group chat, presence, read receipts,
file/voice messages) built to demonstrate industry-standard backend practices.

> This README grows with the project. Each phase adds its section (API docs,
> Socket.IO architecture, Redis architecture, Docker setup, etc.) as it's built.

## Tech Stack

- **Backend:** Node.js, Express, MongoDB + Mongoose, Socket.IO, Redis, JWT, Zod, Multer
- **Frontend:** React, Vite, Socket.IO Client (added in Phase 21)
- **Testing:** Jest, Supertest
- **Docs:** Swagger / OpenAPI (added in Phase 20)
- **Deployment:** Docker, Docker Compose (added in Phase 24)

## Project Structure

```
ChatFlow/
  backend/
    src/
      config/       # env, logger, DB/Redis connections
      controllers/   # HTTP request/response handling
      middlewares/   # auth, error handling, validation, rate limiting
      models/         # Mongoose schemas
      routes/         # URL -> controller mappings
      services/       # business logic
      sockets/        # Socket.IO event handlers
      utils/          # reusable helpers
      validators/     # Zod schemas
      jobs/           # background/scheduled tasks
      app.js          # Express app (no listening)
      server.js       # entry point (listens, wires Socket.IO)
    tests/
  frontend/            # added in Phase 21
```

## Status

Currently on **Phase 1: Architecture and project setup**. See the backend
`/api/health` endpoint for a working smoke test.

## Running Locally (Backend)

```bash
cd backend
npm install
cp .env.example .env   # already done for local dev
npm run dev
```

Then check: `GET http://localhost:5001/api/health`

> **Note (macOS):** Port 5000 is used by macOS's AirPlay Receiver by default,
> which is why this project defaults to 5001 instead.

## Testing (Backend)

```bash
cd backend
npm test
```
