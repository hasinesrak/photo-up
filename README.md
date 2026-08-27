# PhotoUp 📸

A self-hosted photo gallery app: React + Vite frontend, Node/Express API,
MySQL database, JWT auth, and persistent image uploads — fully containerized
with Docker Compose and shipped through a GitHub Actions CI/CD pipeline.

## Architecture

```
┌──────────────────────────── Docker Compose ────────────────────────────┐
│                                                                        │
│  ┌─────────────────┐         ┌───────────────────────────────────┐    │
│  │   db (MySQL     │◀────────│  app (Node API + built frontend)  │    │
│  │   8.4)          │  3306   │  Express · JWT · bcrypt · multer  │    │
│  └────────┬────────┘         └───────────────┬───────────────────┘    │
│           │                                  │                        │
│   ./MySQL data/                       ./upload data/                   │
│   (persistent DB files)               (persistent image uploads)       │
└────────────────────────────────────────────────────────────────────────┘
```

- **Frontend** (`photo-up/src`) — React 19, Vite, Tailwind CSS 4, shadcn/ui
- **API** (`photo-up/server`) — register / login / session, photo upload /
  list / delete; metadata in MySQL, files on disk
- **Storage** — bind-mounted host folders survive restarts and rebuilds

## Quick start

```bash
cp .env.example .env        # then fill in real credentials
docker compose up -d --build
# App:      http://localhost:8080
# Dev mode: pnpm install && pnpm dev   (photo-up/, proxies API to :8080)
```

## CI/CD (GitHub Actions)

One pipeline (`.github/workflows/deploy.yml`) with three sequential stages —
nothing is published unless the previous stage passes:

| Stage | What it does |
|---|---|
| **1. Check** | Typecheck, lint, production build, plus a live integration test: spins up MySQL 8.4 as a service, applies the schema, boots the API, then exercises register → login → upload → list → fetch → delete |
| **2. Build** | Builds the multi-stage image and pushes it to GitHub Container Registry (`ghcr.io/<repo>`) as `latest` + `sha-<7>` (and the tag name for `v*` tags). Runs on every push to `main` / version tags |
| **3. Deploy** | Ships the built image to Docker Hub (`docker.io/<user>/photo-up`). Runs only when repo secrets `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` are configured |

> Pull requests only run the **Check** stage; Build & Deploy run on `main` / tags.

## Security notes

- Real credentials live only in GitHub Actions repository secrets —
  `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `JWT_SECRET`,
  `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` — and in your local `.env`
  (gitignored) for development. `.env.example` is a template.
- Uploads and database files (`upload data/`, `MySQL data/`) are gitignored.
- Passwords are hashed with bcrypt; sessions use signed JWTs with an expiring TTL.

## Repository layout

```
.
├── docker-compose.yml       # app + MySQL services, volumes, healthchecks
├── .env.example             # configuration template
├── .github/workflows/       # one pipeline: check → build → deploy
└── photo-up/
    ├── Dockerfile           # multi-stage build (Vite build → Node runtime)
    ├── server/              # Express API + MySQL schema (init.sql)
    └── src/                 # React app
```
