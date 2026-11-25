// Photos : validation du fichier, envoi vers le stockage, couverture, suppression.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addOperationPhoto, removeOperationPhoto, setCoverPhoto } from "@/lib/services/operations";
import { detectImageType } from "@/lib/storage";
import type { Actor } from "@/lib/services/types";
import { makeUser, openOperation, resetDb } from "./helpers";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

const code = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { if (e instanceof DomainError) return e.code; throw e; }
};

let admin: Actor;
let calls: { method: string; url: string }[];

beforeEach(async () => {
  await resetDb();
  admin = await makeUser("ADMIN");
  process.env.SUPABASE_URL = "https://exemple.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cle-test";
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method ?? "GET", url });
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("photos", () => {
  it("détecte le vrai format du fichier", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(HTML)).toBeNull();
  });

  it("ajoute, met en couverture et supprime ; le fichier est effacé du stockage", async () => {
    const op = await openOperation(admin);
    const a = await addOperationPhoto(admin, op.id, JPEG);
    const b = await addOperationPhoto(admin, op.id, PNG);
    expect(a).toMatch(/^https:\/\/exemple\.supabase\.co\/storage\/v1\/object\/public\/vehicle-photos\/operations\/.+\.jpg$/);
    expect(b).toMatch(/\.png$/);
    const photos = async () => (await prisma.vehicle.findUniqueOrThrow({ where: { id: op.vehicleId } })).photos;
    expect(await photos()).toEqual([a, b]);
    await setCoverPhoto(admin, op.id, b);
    expect(await photos()).toEqual([b, a]);
    await removeOperationPhoto(admin, op.id, b);
    expect(await photos()).toEqual([a]);
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "operation.photo" } } })).toBe(4);
  });

  it("refuse un fichier qui n'est pas une image, sans rien envoyer", async () => {
    const op = await openOperation(admin);
    expect(await code(addOperationPhoto(admin, op.id, HTML))).toBe("BAD_TYPE");
    expect(calls).toHaveLength(0);
  });

  it("réservé aux administrateurs", async () => {
    const op = await openOperation(admin);
    const finance = await makeUser("FINANCE");
    expect(await code(addOperationPhoto(finance, op.id, JPEG))).toBe("FORBIDDEN");
  });

  it("stockage non configuré : message clair", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const op = await openOperation(admin);
    expect(await code(addOperationPhoto(admin, op.id, JPEG))).toBe("STORAGE_OFF");
  });
});
