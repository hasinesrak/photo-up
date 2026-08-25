import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import bcrypt from "bcryptjs"
import express from "express"
import jwt from "jsonwebtoken"
import multer from "multer"
import mysql from "mysql2/promise"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Configuration (injected via environment — see docker-compose.yml / .env)
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT || 3000)
const DB_HOST = process.env.DB_HOST || "db"
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_NAME = process.env.DB_NAME || "photoup"
const DB_USER = process.env.DB_USER || "photoup"
const DB_PASSWORD = process.env.DB_PASSWORD || ""
const JWT_SECRET = process.env.JWT_SECRET || ""
const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.resolve(__dirname, "../uploads")
)
const PUBLIC_DIR = path.resolve(
  process.env.PUBLIC_DIR || path.resolve(__dirname, "../dist")
)

const TOKEN_TTL = "7d"
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set. Refusing to start.")
  process.exit(1)
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  decimalNumbers: true,
})

async function waitUntilDatabaseIsReady() {
  const maxAttempts = 60

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1")
      console.log(`Connected to MySQL at ${DB_HOST}:${DB_PORT}/${DB_NAME}`)
      return
    } catch (error) {
      console.log(
        `Waiting for database (${attempt}/${maxAttempts}): ${error.code ?? error.message}`
      )
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  console.error("FATAL: could not reach the database in time.")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createId() {
  return crypto.randomUUID()
}

function toPublicUser(row) {
  return { id: row.id, name: row.name, email: row.email }
}

function toPhotoRecord(row) {
  return {
    id: row.id,
    name: row.name,
    url: `/uploads/${row.stored_name}`,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: new Date(row.created_at).getTime(),
  }
}

const EXTENSIONS_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = EXTENSIONS_BY_MIME[file.mimetype] ??
      path.extname(file.originalname).toLowerCase()
    callback(null, `${createId()}${extension}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype in EXTENSIONS_BY_MIME) {
      callback(null, true)
      return
    }
    callback(new Error("Only JPEG, PNG, GIF, WebP or AVIF images are allowed."))
  },
})

function authenticate() {
  return async (req, res, next) => {
    const header = req.headers.authorization ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : null

    if (!token) {
      res.status(401).json({ error: "You are not logged in." })
      return
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET)
      const [rows] = await pool.query(
        "SELECT id, name, email FROM users WHERE id = :id",
        { id: payload.sub }
      )

      if (rows.length === 0) {
        res.status(401).json({ error: "This account no longer exists." })
        return
      }

      req.user = rows[0]
      next()
    } catch {
      res.status(401).json({ error: "Your session has expired. Log in again." })
    }
  }
}

// ---------------------------------------------------------------------------
// App + routes
// ---------------------------------------------------------------------------
const app = express()
app.disable("x-powered-by")
app.use(express.json({ limit: "100kb" }))

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1")
    res.json({ status: "ok", database: "up" })
  } catch {
    res.status(503).json({ status: "degraded", database: "down" })
  }
})

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body?.name ?? "").trim()
  const email = String(req.body?.email ?? "").trim().toLowerCase()
  const password = String(req.body?.password ?? "")

  if (!name) {
    res.status(400).json({ error: "Please enter your name." })
    return
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    res.status(400).json({ error: "Please enter a valid email address." })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters long." })
    return
  }
  if (name.length > 120) {
    res.status(400).json({ error: "Name is too long." })
    return
  }

  try {
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = :email",
      { email }
    )

    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists." })
      return
    }

    const id = createId()
    const passwordHash = await bcrypt.hash(password, 12)

    await pool.query(
      "INSERT INTO users (id, name, email, password_hash) VALUES (:id, :name, :email, :passwordHash)",
      { id, name, email, passwordHash }
    )

    const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: TOKEN_TTL })
    res.status(201).json({ token, user: { id, name, email } })
  } catch (error) {
    console.error("register failed:", error)
    res.status(500).json({ error: "Could not create the account. Try again." })
  }
})

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase()
  const password = String(req.body?.password ?? "")

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email = :email",
      { email }
    )

    if (rows.length === 0) {
      res.status(401).json({ error: "Invalid email or password." })
      return
    }

    const user = rows[0]
    const matches = await bcrypt.compare(password, user.password_hash)

    if (!matches) {
      res.status(401).json({ error: "Invalid email or password." })
      return
    }

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL })
    res.json({ token, user: toPublicUser(user) })
  } catch (error) {
    console.error("login failed:", error)
    res.status(500).json({ error: "Could not log you in. Try again." })
  }
})

app.get("/api/auth/me", authenticate(), (req, res) => {
  res.json({ user: toPublicUser(req.user) })
})

app.get("/api/photos", authenticate(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM photos WHERE user_id = :userId ORDER BY created_at DESC",
      { userId: req.user.id }
    )
    res.json({ photos: rows.map(toPhotoRecord) })
  } catch (error) {
    console.error("listing photos failed:", error)
    res.status(500).json({ error: "Could not load your photos." })
  }
})

app.post("/api/photos", authenticate(), upload.single("photo"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image was received." })
    return
  }

  try {
    const id = createId()

    await pool.query(
      `INSERT INTO photos (id, user_id, name, stored_name, mime_type, size_bytes)
       VALUES (:id, :userId, :name, :storedName, :mimeType, :sizeBytes)`,
      {
        id,
        userId: req.user.id,
        name: req.file.originalname.slice(0, 255),
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      }
    )

    res.status(201).json({
      photo: toPhotoRecord({
        id,
        name: req.file.originalname,
        stored_name: req.file.filename,
        mime_type: req.file.mimetype,
        size_bytes: req.file.size,
        created_at: new Date(),
      }),
    })
  } catch (error) {
    fs.rm(path.join(UPLOAD_DIR, req.file.filename), { force: true }, () => {})
    console.error("saving photo failed:", error)
    res.status(500).json({ error: "Could not save the photo." })
  }
})

app.delete("/api/photos/:id", authenticate(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT stored_name FROM photos WHERE id = :id AND user_id = :userId",
      { id: req.params.id, userId: req.user.id }
    )

    if (rows.length === 0) {
      res.status(404).json({ error: "That photo does not exist." })
      return
    }

    await pool.query("DELETE FROM photos WHERE id = :id", { id: req.params.id })
    fs.rm(path.join(UPLOAD_DIR, rows[0].stored_name), { force: true }, () => {})

    res.json({ ok: true })
  } catch (error) {
    console.error("deleting photo failed:", error)
    res.status(500).json({ error: "Could not delete the photo." })
  }
})

// Uploaded files are private-ish: served only through this static mount.
app.use("/uploads", express.static(UPLOAD_DIR, { fallthrough: false, maxAge: "30d" }))

// Serve the built SPA.
app.use(express.static(PUBLIC_DIR))
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next()
  res.sendFile(path.join(PUBLIC_DIR, "index.html"), (error) => {
    if (error) next()
  })
})

// Express error handler (4 args required for Express to recognize it).
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Images can be at most 10 MB." })
    return
  }
  console.error("unhandled error:", error)
  res.status(error.status ?? 500).json({
    error: error.status ? error.message : "Something went wrong on the server.",
  })
})

waitUntilDatabaseIsReady().then(() => {
  app.listen(PORT, () => {
    console.log(`PhotoUp API listening on http://localhost:${PORT}`)
    console.log(`Serving uploads from ${UPLOAD_DIR}`)
    console.log(`Serving frontend from ${PUBLIC_DIR}`)
  })
})
