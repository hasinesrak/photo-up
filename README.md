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

## GitOps with Argo CD

Argo CD deploys the app to Kubernetes straight from this repo — git is the
source of truth:

```
push code → CI builds & pushes image to GHCR
                          ↓
Argo CD watches k8s/ in this repo → syncs → cluster rolls it out
```

- `k8s/photo-up.yaml` — manifests for the stack (namespace, app + MySQL
  Deployments, Services, PVCs, ConfigMaps, demo Secret)
- `argocd/application.yaml` — Argo CD Application watching `k8s/` on `main`
  with automated sync (`selfHeal` + `prune`)

```bash
# Install Argo CD (fresh cluster):
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Reach the UI:
kubectl port-forward svc/argocd-server -n argocd 8443:443   # https://127.0.0.1:8443
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Register the app (declarative):
kubectl apply -f argocd/application.yaml
```

Deploying a new version only requires changing `k8s/` in git (e.g. the image
tag) — Argo CD rolls it out automatically and reverts on a bad commit. And a
CI step already does that bump for you: on every push to `main` the **build**
job updates `k8s/photo-up.yaml` to the newly built `sha-<7>` image tag and
commits it back, so Argo CD continuously rolls out each new image — no manual
manifest edits needed.

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
