# CreatorHub AI Backend
Runs without MongoDB, so it is easy for the hackathon demo.

## Start
npm install
copy .env.example .env
npm run dev

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

New data is stored in memory and resets when the server restarts.
