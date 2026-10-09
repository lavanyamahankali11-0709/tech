# CreatorHub AI Backend
Runs without MongoDB, so it is easy for the hackathon demo.

## Start
Run these commands from the `backend` directory:

npm ci
copy .env.example .env
npm run dev

For the Render deployment instructions, see the repository-root `README.md`.

## Main APIs
GET /health
GET /api/dashboard
GET /api/creators
GET /api/creators/:id
POST /api/ai/match
GET /api/campaigns
POST /api/campaigns
GET /api/campaigns/:id
POST /api/ai/content
POST /api/ai/performance
GET /api/messages
GET /api/payments

New data is stored in memory and resets when the server restarts or redeploys.
