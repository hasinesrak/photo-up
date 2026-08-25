import * as React from "react"
import { toast } from "sonner"
import {
  CloudArrowUpIcon,
  DownloadSimpleIcon,
  ImagesIcon,
  MagnifyingGlassPlusIcon,
  SignOutIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"

import { useAuth } from "@/components/auth-provider"
import * as auth from "@/lib/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"

type UploadStatus = "uploading" | "ready" | "error"

type GalleryPhoto = auth.PhotoRecord & {
  status: UploadStatus
  progress: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Header({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth()
  if (!user) return null

  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
            <ImagesIcon weight="fill" className="size-5" />
          </div>
          <span className="font-heading text-lg font-bold tracking-tight">
            PhotoUp
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Open account menu"
          >
            <span className="relative flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground ring-1 ring-border transition-transform hover:scale-105 active:scale-95">
              {initials || "U"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={onLogout}
              className="cursor-pointer"
            >
              <SignOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export function Dashboard() {
  const { user, logout } = useAuth()

  const [photos, setPhotos] = React.useState<GalleryPhoto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dragActive, setDragActive] = React.useState(false)
  const [lightboxId, setLightboxId] = React.useState<string | null>(null)

  const inputRef = React.useRef<HTMLInputElement>(null)

  // Load the user's library from the API (MySQL + upload volume).
  React.useEffect(() => {
    let cancelled = false

    auth
      .listPhotos()
      .then((records) => {
        if (cancelled) return
        setPhotos(
          records.map((photo) => ({
            ...photo,
            status: "ready" as const,
            progress: 100,
          }))
        )
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load your photos.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  function updatePhoto(id: string, changes: Partial<GalleryPhoto>) {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, ...changes } : photo
      )
    )
  }

  function uploadFile(file: File, id: string) {
    void (async () => {
      try {
        const record = await auth.uploadPhoto(file, (percent) =>
          updatePhoto(id, { progress: percent })
        )
        updatePhoto(id, {
          ...record,
          status: "ready",
          progress: 100,
        })
        toast.success(`"${file.name}" uploaded`)
      } catch (cause) {
        setPhotos((current) => current.filter((photo) => photo.id !== id))
        toast.error(
          cause instanceof Error
            ? cause.message
            : `Failed to upload "${file.name}"`
        )
      }
    })()
  }

  function handleFiles(files: Iterable<File>) {
    const accepted = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    )

    if (accepted.length === 0) {
      toast.error("Only image files can be uploaded.")
      return
    }

    for (const file of accepted) {
      const id = crypto.randomUUID()
      setPhotos((current) => [
        {
          id,
          name: file.name,
          url: "",
          mimeType: file.type,
          sizeBytes: file.size,
          createdAt: Date.now(),
          status: "uploading",
          progress: 8,
        },
        ...current,
      ])
      uploadFile(file, id)
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    handleFiles(event.dataTransfer.files)
  }

  function deletePhoto(id: string) {
    // Optimistically remove; roll back if the server rejects it.
    const previous = photos
    setPhotos((current) => current.filter((photo) => photo.id !== id))
    if (lightboxId === id) setLightboxId(null)

    void auth.deletePhoto(id).catch(() => {
      setPhotos(previous)
      toast.error("Could not delete the photo.")
    })
  }

  const lightboxPhoto = photos.find((photo) => photo.id === lightboxId)

  // Close the lightbox with Escape.
  React.useEffect(() => {
    if (!lightboxId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxId(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [lightboxId])

  const totalBytes = photos.reduce((sum, photo) => sum + photo.sizeBytes, 0)
  const uploadingCount = photos.filter(
    (photo) => photo.status === "uploading"
  ).length

  return (
    <div className="min-h-svh">
      <Header
        onLogout={() => {
          logout()
          toast.success("Logged out. See you soon!")
        }}
      />

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Page intro */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Your library
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span>Hi {user?.name.split(" ")[0]}, drop some photos below.</span>
            <Badge variant="secondary">
              <ImagesIcon weight="fill" data-icon="inline-start" />
              {photos.length} {photos.length === 1 ? "photo" : "photos"}
            </Badge>
            {totalBytes > 0 && (
              <Badge variant="outline">{formatBytes(totalBytes)} used</Badge>
            )}
          </p>
        </div>

        {/* Upload zone */}
        <Card className="mt-8 overflow-hidden shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle>Upload photos</CardTitle>
            <CardDescription>
              Drag &amp; drop images anywhere on the card, or browse your files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload photos"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  inputRef.current?.click()
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={[
                "group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-4xl border-2 border-dashed px-6 py-12 text-center outline-none transition-all duration-300",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                dragActive
                  ? "scale-[1.01] border-primary bg-primary/5 shadow-inner"
                  : "border-border bg-input/20 hover:border-primary/40 hover:bg-input/40",
              ].join(" ")}
            >
              <div
                className={[
                  "flex size-14 items-center justify-center rounded-2xl transition-all duration-300",
                  dragActive
                    ? "scale-110 rotate-3 bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground ring-1 ring-border group-hover:-translate-y-1 group-hover:text-primary",
                ].join(" ")}
              >
                <CloudArrowUpIcon weight="duotone" className="size-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {dragActive
                    ? "Drop them right here!"
                    : "Drag & drop your photos here"}
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, GIF or WebP · up to 10 MB
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-none"
                tabIndex={-1}
              >
                <DownloadSimpleIcon className="rotate-180" />
                Browse files
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) handleFiles(event.target.files)
                  event.target.value = ""
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Separator className="my-10" />

        {/* Gallery */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="aspect-square animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <Empty
            className="animate-in fade-in zoom-in-95 duration-500 rounded-4xl border border-dashed"
            style={{ minHeight: "22rem" }}
          >
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImagesIcon />
              </EmptyMedia>
              <EmptyTitle>No photos yet</EmptyTitle>
              <EmptyDescription>
                Upload your first photo and it will appear here, right where the
                magic happens.
              </EmptyDescription>
            </EmptyHeader>
            <Button onClick={() => inputRef.current?.click()}>
              <CloudArrowUpIcon weight="fill" />
              Upload photos
            </Button>
          </Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                className={[
                  "group relative aspect-square animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-500 fill-mode-backwards",
                  photo.status === "error" ? "hidden" : "",
                ].join(" ")}
                style={{
                  animationDelay: `${Math.min(index * 60, 480)}ms`,
                }}
              >
                <button
                  type="button"
                  aria-label={`View ${photo.name}`}
                  onClick={() => setLightboxId(photo.id)}
                  disabled={photo.status !== "ready"}
                  className="block size-full overflow-hidden rounded-2xl bg-muted ring-1 ring-border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none"
                >
                  {photo.status === "uploading" ? (
                    <span className="flex size-full flex-col items-center justify-center gap-3 p-4">
                      <span className="size-full animate-pulse rounded-xl bg-muted-foreground/10" />
                      <span className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary transition-all duration-300 ease-out"
                          style={{ width: `${Math.round(photo.progress)}%` }}
                        />
                      </span>
                    </span>
                  ) : (
                    <img
                      src={photo.url}
                      alt={photo.name}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                </button>

                {photo.status !== "uploading" && (
                  <>
                    <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-xl bg-gradient-to-t from-black/60 to-transparent p-2.5 pt-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <p className="truncate text-left text-xs font-medium text-white">
                        {photo.name}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      aria-label={`Delete ${photo.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        deletePhoto(photo.id)
                      }}
                      className="absolute top-2 right-2 translate-y-1 opacity-0 shadow-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
                    >
                      <TrashIcon weight="fill" className="text-destructive" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {uploadingCount > 0 && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            Uploading {uploadingCount}{" "}
            {uploadingCount === 1 ? "photo" : "photos"}…
          </p>
        )}
      </main>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          role="dialog"
          aria-label={lightboxPhoto.name}
          aria-modal="true"
          onClick={() => setLightboxId(null)}
          className="fixed inset-0 z-50 flex animate-in fade-in duration-300 cursor-zoom-out items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
        >
          <figure
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full animate-in fade-in zoom-in-95 duration-300"
          >
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.name}
              className="max-h-[80svh] max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/10"
            />
            <figcaption className="mt-3 flex items-center justify-center gap-2 text-sm text-white/80">
              <MagnifyingGlassPlusIcon />
              {lightboxPhoto.name}
            </figcaption>
          </figure>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Close preview"
            onClick={() => setLightboxId(null)}
            className="absolute top-5 right-5 shadow-lg"
          >
            <XIcon weight="bold" />
          </Button>
        </div>
      )}
    </div>
  )
}
