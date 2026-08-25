export type User = {
  id: string
  name: string
  email: string
}

export type PhotoRecord = {
  id: string
  name: string
  url: string
  mimeType: string
  sizeBytes: number
  createdAt: number
}

const TOKEN_KEY = "photo-up:token"

// ---------------------------------------------------------------------------
// Token + low-level fetch helper
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getToken()

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(path, { ...options, headers })
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null

  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? "Something went wrong. Try again.")
  }

  return payload
}

// ---------------------------------------------------------------------------
// Auth — backed by the MySQL database through /api/auth/*
// ---------------------------------------------------------------------------

type AuthResponse = { token: string; user: User }

export async function register(
  name: string,
  email: string,
  password: string
): Promise<User> {
  const { token, user } = await request<AuthResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  })

  setToken(token)
  return user
}

export async function login(email: string, password: string): Promise<User> {
  const { token, user } = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  setToken(token)
  return user
}

export function logout(): void {
  clearToken()
}

/** Restores the session from a stored token. Returns null when signed out. */
export async function getSessionUser(): Promise<User | null> {
  if (!getToken()) return null

  try {
    const { user } = await request<{ user: User }>("/api/auth/me")
    return user
  } catch {
    clearToken()
    return null
  }
}

// ---------------------------------------------------------------------------
// Photos — stored on disk ("upload data" volume) with metadata in MySQL
// ---------------------------------------------------------------------------

export async function listPhotos(): Promise<PhotoRecord[]> {
  const { photos } = await request<{ photos: PhotoRecord[] }>("/api/photos")
  return photos
}

export function uploadPhoto(
  file: File,
  onProgress?: (percent: number) => void
): Promise<PhotoRecord> {
  return new Promise((resolve, reject) => {
    const body = new FormData()
    body.append("photo", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/photos")

    const token = getToken()
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.max(8, Math.round((event.loaded / event.total) * 95)))
      }
    }

    xhr.onerror = () => reject(new Error("Could not reach the server."))
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText ?? "null") as
          | { photo?: PhotoRecord; error?: string }
          | null

        if (xhr.status >= 200 && xhr.status < 300 && payload?.photo) {
          resolve(payload.photo)
        } else {
          reject(new Error(payload?.error ?? "Upload failed."))
        }
      } catch {
        reject(new Error("Upload failed."))
      }
    }

    xhr.send(body)
  })
}

export async function deletePhoto(id: string): Promise<void> {
  await request(`/api/photos/${id}`, { method: "DELETE" })
}
