// Stockage des photos de véhicules dans Supabase Storage (bucket public en lecture,
// écriture réservée au serveur grâce à la clé secrète). Aucune dépendance : API REST.
import { randomUUID } from "node:crypto";
import { DomainError } from "./errors";

export const PHOTO_BUCKET = "vehicle-photos";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 12;

const TYPES = {
  "image/jpeg": { ext: "jpg", magic: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": {
    ext: "webp",
    magic: (b: Uint8Array) =>
      String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP",
  },
} as const;

type ImageType = keyof typeof TYPES;

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export function storageConfigured(): boolean {
  return config() !== null;
}

/** Vérifie le type réel du fichier (octets d'en-tête), pas seulement l'extension annoncée. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;
  for (const [type, t] of Object.entries(TYPES)) if (t.magic(bytes)) return type as ImageType;
  return null;
}

export function validatePhoto(bytes: Uint8Array): ImageType {
  if (bytes.length === 0) throw new DomainError("EMPTY", "Fichier vide.");
  if (bytes.length > MAX_PHOTO_BYTES) throw new DomainError("TOO_LARGE", "Image trop lourde (5 Mo maximum).");
  const type = detectImageType(bytes);
  if (!type) throw new DomainError("BAD_TYPE", "Format non accepté : JPEG, PNG ou WebP uniquement.");
  return type;
}

const headers = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}` });

/** Envoie une photo et renvoie son URL publique. */
export async function uploadVehiclePhoto(operationId: string, bytes: Uint8Array): Promise<string> {
  const cfg = config();
  if (!cfg) throw new DomainError("STORAGE_OFF", "Le stockage des photos n'est pas configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const type = validatePhoto(bytes);
  const path = `operations/${operationId}/${randomUUID()}.${TYPES[type].ext}`;
  const res = await fetch(`${cfg.url}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: "POST",
    headers: { ...headers(cfg.key), "Content-Type": type, "Cache-Control": "31536000", "x-upsert": "false" },
    body: Buffer.from(bytes),
  });
  if (!res.ok) {
    console.error("[storage] upload", res.status, await res.text().catch(() => ""));
    throw new DomainError("UPLOAD_FAILED", "L'envoi de la photo a échoué. Réessayez.");
  }
  return `${cfg.url}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

/** Chemin dans le bucket si l'URL est une photo hébergée par nous, sinon null (lien externe). */
export function storedPhotoPath(url: string): string | null {
  const cfg = config();
  if (!cfg) return null;
  const prefix = `${cfg.url}/storage/v1/object/public/${PHOTO_BUCKET}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/** Supprime une photo hébergée (sans effet pour un lien externe). Une erreur n'est pas bloquante. */
export async function deleteStoredPhoto(url: string): Promise<void> {
  const cfg = config();
  const path = storedPhotoPath(url);
  if (!cfg || !path) return;
  const res = await fetch(`${cfg.url}/storage/v1/object/${PHOTO_BUCKET}/${path}`, { method: "DELETE", headers: headers(cfg.key) });
  if (!res.ok) console.error("[storage] delete", res.status, await res.text().catch(() => ""));
}

// ─────────────── Stockage privé (preuves de paiement) : lecture par lien signé temporaire ───────────────

export const PROOF_BUCKET = "deposit-proofs";

export async function uploadPrivateImage(bucket: string, prefix: string, bytes: Uint8Array): Promise<string> {
  const cfg = config();
  if (!cfg) throw new DomainError("STORAGE_OFF", "Le stockage des fichiers n'est pas configuré.");
  const type = validatePhoto(bytes);
  const path = `${prefix}/${randomUUID()}.${TYPES[type].ext}`;
  const res = await fetch(`${cfg.url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { ...headers(cfg.key), "Content-Type": type, "x-upsert": "false" },
    body: Buffer.from(bytes),
  });
  if (!res.ok) {
    console.error("[storage] upload privé", res.status, await res.text().catch(() => ""));
    throw new DomainError("UPLOAD_FAILED", "L'envoi du fichier a échoué. Réessayez.");
  }
  return path;
}

/** Lien de lecture valable quelques minutes, pour un fichier privé. */
export async function signedUrl(bucket: string, path: string, expiresIn = 300): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;
  const res = await fetch(`${cfg.url}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { ...headers(cfg.key), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { signedURL?: string } | null;
  return data?.signedURL ? `${cfg.url}/storage/v1${data.signedURL}` : null;
}
