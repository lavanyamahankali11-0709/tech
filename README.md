# CreatorHub

CreatorHub contains a Vite/React frontend and an Express API.
Use Node.js 22 or newer for both services.

## Deploy both services to Render

1. In Render, choose **New > Blueprint**.
2. Connect `lavanyamahankali11-0709/tech` and select the `main` branch.
3. Review the two services from `render.yaml` and apply the Blueprint.

The Blueprint builds the API from `backend/` and the static site from
`frontend/`. It configures the frontend to call the API and allows browser
requests from the deployed frontend, provisions PostgreSQL, and generates a
JWT signing secret. The backend health check is `/health`.
The included free PostgreSQL tier is for demos; check Render's current free
database retention limits before relying on it for a long-running deployment.

If you rename either Render service or attach a custom domain, update
`FRONTEND_URL` and `VITE_API_URL` in `render.yaml` to match.

## Run locally

Create a local PostgreSQL database named `creatorhub`, copy
`backend/.env.example` to `backend/.env`, and adjust `DATABASE_URL` and
`JWT_SECRET`. Then install and start the API:

```sh
cd backend
npm ci
npm run dev
```

In a second terminal, install and start the frontend:

```sh
cd frontend
npm ci
npm run dev
```

The frontend defaults to `http://localhost:5000` for the API. To override it,
copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_URL`.

## Prototype data model

The PostgreSQL schema is initialized on startup. Creator profiles keep
specialization, skills, tools/models, content types, aspect-ratio formats,
audience, commercial-use availability, verification signals, and portfolio
entries (including workflow and per-project licensing). Briefs capture the
brand, creative direction, content type, visual style, delivery formats and
aspect ratio, budget, deadline, commercial-use requirement, and usage terms.
User accounts store a bcrypt password hash and brand/creator role; API sessions
use a generated JWT secret. Demo creator profiles seed an empty database once.
Creator pitches progress through applied, shortlisted, accepted, delivered,
and completed states.

The AI brief builder currently uses transparent, deterministic drafting rules
and returns an editable suggestion; connect a model provider for generated
copy before presenting it as an LLM feature. Verification fields are prototype
trust signals and are not third-party attestations.

## Demo path

1. Browse creator profiles and filter by an AI tool or content type.
2. Register as a brand, use the AI-assisted draft in the brief builder, and
   publish a brief with clear formats, aspect ratio, budget and rights.
3. Register as a creator, complete a portfolio entry and pitch for a brief.
4. Sign back in as the brand to shortlist/accept a pitch; as the creator mark
   delivery submitted, then approve it as the brand.
