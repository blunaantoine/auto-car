"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/actions";

type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;

const MAX_SIDE = 1920;
const MAX_UPLOAD = 4 * 1024 * 1024;

/** Réduit l'image à 1920 px max et la convertit en JPEG (photos de téléphone de 5 à 12 Mo → ~0,5 Mo). */
async function prepare(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (blob) return blob;
  } catch {
    /* format non décodable par le navigateur : on tente l'envoi tel quel */
  }
  return file;
}

export function PhotoManager(props: {
  operationId: string;
  photos: string[];
  max: number;
  enabled: boolean;
  upload: Act;
  addLink: Act;
  remove: Act;
  cover: Act;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState("");
  const [broken, setBroken] = useState<Set<string>>(new Set());

  function addLink() {
    if (!link.trim()) return;
    const fd = new FormData();
    fd.set("operationId", props.operationId);
    fd.set("url", link);
    startTransition(async () => {
      const res = await props.addLink(null, fd);
      setErrors(res?.error ? [res.error] : []);
      if (!res?.error) setLink("");
      router.refresh();
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, props.max - props.photos.length));
    const errs: string[] = [];
    if (list.length < files.length) errs.push(`${props.max} photos maximum : ${files.length - list.length} image(s) ignorée(s).`);
    for (let i = 0; i < list.length; i++) {
      setProgress(`Envoi ${i + 1} / ${list.length}…`);
      const blob = await prepare(list[i]);
      if (blob.size > MAX_UPLOAD) {
        errs.push(`${list[i].name} : image trop lourde.`);
        continue;
      }
      const fd = new FormData();
      fd.set("operationId", props.operationId);
      fd.set("photo", blob, list[i].name.replace(/\.\w+$/, "") + ".jpg");
      const res = await props.upload(null, fd);
      if (res?.error) errs.push(`${list[i].name} : ${res.error}`);
    }
    setProgress(null);
    setErrors(errs);
    if (input.current) input.current.value = "";
    startTransition(() => router.refresh());
  }

  function act(action: Act, url: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const fd = new FormData();
    fd.set("operationId", props.operationId);
    fd.set("url", url);
    startTransition(async () => {
      const res = await action(null, fd);
      setErrors(res?.error ? [res.error] : []);
      router.refresh();
    });
  }

  const busy = pending || progress !== null;
  return (
    <div className="space-y-4">
      {props.photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {props.photos.map((url, i) => (
            <li key={url} className="overflow-hidden rounded-lg border border-line bg-white">
              <div className="relative aspect-[4/3] bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {broken.has(url) ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center text-xs text-red-700">
                    <strong>Image introuvable</strong>
                    <span className="break-all text-muted">{url.slice(0, 80)}</span>
                  </div>
                ) : (
                  <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy"
                    onError={() => setBroken((b) => new Set(b).add(url))} />
                )}
                {i === 0 && <span className="absolute left-2 top-2 rounded bg-ink px-2 py-0.5 text-xs font-semibold text-white">Couverture</span>}
              </div>
              <div className="flex gap-1 p-2">
                {i > 0 && (
                  <button type="button" className="btn-ghost flex-1 px-2 py-1 text-xs" disabled={busy} onClick={() => act(props.cover, url)}>
                    En couverture
                  </button>
                )}
                <button type="button" className="btn-danger flex-1 px-2 py-1 text-xs" disabled={busy} onClick={() => act(props.remove, url, "Supprimer cette photo ?")}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune photo pour l&apos;instant.</p>
      )}

      {props.photos.length < props.max && (
        <div className="grid gap-4 rounded-lg bg-paper p-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Envoyer des fichiers</div>
            {props.enabled ? (
              <>
                <label className="btn-primary cursor-pointer" aria-disabled={busy}>
                  {progress ?? "Choisir des photos"}
                  <input
                    ref={input}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => onFiles(e.target.files)}
                  />
                </label>
                <p className="mt-2 text-xs text-muted">
                  JPEG, PNG ou WebP, depuis l&apos;ordinateur ou le téléphone. Réduites automatiquement avant l&apos;envoi.
                </p>
              </>
            ) : (
              <p className="text-xs text-amber-900">
                Envoi de fichiers indisponible : ajoutez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY aux variables
                d&apos;environnement. L&apos;ajout par lien reste possible.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="photo-link" className="mb-2 block text-sm font-semibold text-ink">Ou ajouter par lien</label>
            <div className="flex gap-2">
              <input
                id="photo-link"
                type="url"
                inputMode="url"
                placeholder="https://…/photo.jpg"
                className="input"
                value={link}
                disabled={busy}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
              />
              <button type="button" className="btn-ghost" disabled={busy || !link.trim()} onClick={addLink}>
                Ajouter
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">Lien direct vers une image (http:// ou https://). Plusieurs liens séparés par un espace.</p>
          </div>
        </div>
      )}
      <p className="text-xs text-muted">{props.photos.length} / {props.max} photos.</p>
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
