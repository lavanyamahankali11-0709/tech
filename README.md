# CreatorHub

CreatorHub contains a Vite/React frontend and an Express API.
Use Node.js 22 or newer for both services.

## Deploy both services to Render

1. In Render, choose **New > Blueprint**.
2. Connect `lavanyamahankali11-0709/tech` and select the `main` branch.
3. Review the two services from `render.yaml` and apply the Blueprint.

The Blueprint builds the API from `backend/` and the static site from
`frontend/`. It configures the frontend to call the API and allows browser
requests from the deployed frontend. The backend health check is `/health`.

If you rename either Render service or attach a custom domain, update
`FRONTEND_URL` and `VITE_API_URL` in `render.yaml` to match.

## Run locally

Install and start the API:

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

## Data storage

The API currently stores data in memory. Created data is lost when the service
restarts or redeploys; use a persistent database before relying on it for
production data.
