// Inscription, vérification, connexion et sessions — CDC §5.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { VerificationPurpose } from "@prisma/client";
import { inTransaction, prisma } from "../db";
import { DomainError } from "../errors";
import { getUserWallet } from "../ledger/ledger";
import { audit } from "./audit";
import { requirePermission, type Actor } from "./types";
import { can } from "../auth/permissions";
import type { Role } from "@prisma/client";

let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("interglobe-dummy-password", 12));

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 jours
const CODE_TTL_MS = 1000 * 60 * 15;
const MAX_CODE_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 1000 * 60 * 15;
const MAX_LOGIN_FAILURES = 5;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Le mot de passe doit contenir au moins 10 caractères.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Le mot de passe doit contenir des lettres et des chiffres.";
  return null;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  countryCode: string;
  city?: string;
}

export async function register(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  const pwError = validatePassword(input.password);
  if (pwError) throw new DomainError("WEAK_PASSWORD", pwError);
  const country = await prisma.country.findUnique({ where: { code: input.countryCode } });
  if (!country || !country.active) throw new DomainError("COUNTRY_UNAVAILABLE", "Ce pays n'est pas encore ouvert.");
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new DomainError("EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.");
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await inTransaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        phone: input.phone?.trim() || null,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        passwordHash,
        countryCode: country.code,
        city: input.city?.trim() || null,
      },
    });
    await getUserWallet(tx, u.id);
    await audit(tx, { id: u.id, role: u.role }, { action: "user.register", entityType: "User", entityId: u.id, after: { email, country: country.code } });
    return u;
  });
  const code = await issueCode(user.id, "EMAIL");
  return { user, code };
}

/** Génère un code à usage unique (6 chiffres). Seul son hachage est conservé. */
export async function issueCode(userId: string, purpose: VerificationPurpose): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.verificationCode.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.verificationCode.create({
    data: { userId, purpose, codeHash: sha256(`${userId}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  // Pas de fournisseur e-mail/SMS branché dans le MVP : le code est journalisé côté serveur.
  if (process.env.NODE_ENV !== "test") console.info(`[verification] ${purpose} code pour ${userId} : ${code}`);
  return code;
}

export async function verifyEmail(userId: string, code: string) {
  const record = await prisma.verificationCode.findFirst({
    where: { userId, purpose: "EMAIL", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt < new Date()) throw new DomainError("CODE_EXPIRED", "Code expiré : demandez-en un nouveau.");
  if (record.attempts >= MAX_CODE_ATTEMPTS) throw new DomainError("CODE_LOCKED", "Trop d'essais : demandez un nouveau code.");
  const expected = Buffer.from(record.codeHash);
  const given = Buffer.from(sha256(`${userId}:${code.trim()}`));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw new DomainError("CODE_INVALID", "Code incorrect.");
  }
  await inTransaction(async (tx) => {
    await tx.verificationCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), status: user.status === "PENDING_VERIFICATION" ? "ACTIVE" : user.status },
    });
    await audit(tx, { id: userId, role: user.role }, { action: "user.verify_email", entityType: "User", entityId: userId });
  });
}

export async function login(emailRaw: string, password: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const email = emailRaw.trim().toLowerCase();
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const failures = await prisma.loginEvent.count({ where: { email, success: false, createdAt: { gte: since } } });
  if (failures >= MAX_LOGIN_FAILURES)
    throw new DomainError("RATE_LIMITED", "Trop de tentatives. Réessayez dans quelques minutes.");

  const user = await prisma.user.findUnique({ where: { email } });
  // hachage factice pour un temps de réponse homogène si le compte n'existe pas
  const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  await prisma.loginEvent.create({ data: { email, userId: user?.id, success: ok && !!user, ip: meta.ip, userAgent: meta.userAgent } });
  if (!user || !ok) throw new DomainError("BAD_CREDENTIALS", "Adresse e-mail ou mot de passe incorrect.");
  if (user.status === "SUSPENDED") throw new DomainError("SUSPENDED", "Ce compte est suspendu. Contactez l'assistance.");

  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS), ip: meta.ip, userAgent: meta.userAgent },
  });
  return { user, token };
}

export async function getUserBySessionToken(token: string) {
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status === "SUSPENDED") return null;
  return session.user;
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function logoutAll(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function setUserStatus(
  actor: Actor,
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
  reason: string,
) {
  requirePermission(actor, "users.manage");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  if (actor.id === userId) throw new DomainError("SELF", "Vous ne pouvez pas modifier votre propre statut.");
  await inTransaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u) throw new DomainError("NOT_FOUND", "Utilisateur introuvable.");
    assertCanManage(actor, u.role);
    if (status === "ACTIVE" && !u.emailVerifiedAt) throw new DomainError("NOT_VERIFIED", "Le compte n'a pas vérifié son adresse e-mail.");
    await tx.user.update({ where: { id: userId }, data: { status, suspendedReason: status === "SUSPENDED" ? reason : null } });
    if (status === "SUSPENDED") await tx.session.deleteMany({ where: { userId } });
    await audit(tx, actor, { action: `user.${status.toLowerCase()}`, entityType: "User", entityId: userId, before: { status: u.status }, after: { status }, reason });
  });
}

// ─────────────────────────── Gestion des comptes par l'administration ───────────────────────────

/** Un administrateur gère les investisseurs ; seuls les super administrateurs gèrent le personnel. */
function assertCanManage(actor: Actor, targetRole: Role) {
  if (targetRole !== "INVESTOR" && !can(actor.role, "staff.manage"))
    throw new DomainError("FORBIDDEN", "Seul un super administrateur peut gérer un compte du personnel.");
}

export interface ProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  countryCode: string;
  city: string | null;
}

export async function updateUserProfile(actor: Actor, userId: string, input: ProfileInput, reason: string) {
  requirePermission(actor, "users.manage");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  const email = input.email.trim().toLowerCase();
  await inTransaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u) throw new DomainError("NOT_FOUND", "Utilisateur introuvable.");
    if (u.id !== actor.id) assertCanManage(actor, u.role);
    const country = await tx.country.findUnique({ where: { code: input.countryCode } });
    if (!country) throw new DomainError("INVALID", "Pays inconnu.");
    if (email !== u.email && (await tx.user.findUnique({ where: { email } })))
      throw new DomainError("EMAIL_TAKEN", "Cette adresse e-mail est déjà utilisée par un autre compte.");
    const data = { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email, phone: input.phone?.trim() || null, countryCode: country.code, city: input.city?.trim() || null };
    await tx.user.update({ where: { id: userId }, data });
    await audit(tx, actor, {
      action: "user.profile.update",
      entityType: "User",
      entityId: userId,
      before: { firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, countryCode: u.countryCode, city: u.city },
      after: data,
      reason,
    });
  });
}

/** Validation manuelle du compte (ex. code non reçu), après vérification par l'assistance. */
export async function markEmailVerified(actor: Actor, userId: string, reason: string) {
  requirePermission(actor, "users.manage");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  await inTransaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u) throw new DomainError("NOT_FOUND", "Utilisateur introuvable.");
    assertCanManage(actor, u.role);
    if (u.emailVerifiedAt) throw new DomainError("ALREADY", "Ce compte est déjà vérifié.");
    await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), status: u.status === "PENDING_VERIFICATION" ? "ACTIVE" : u.status } });
    await audit(tx, actor, { action: "user.verify_manual", entityType: "User", entityId: userId, reason });
  });
}

/**
 * Réinitialisation du mot de passe par un super administrateur : génère un mot de passe
 * temporaire (affiché une seule fois), ferme toutes les sessions du compte.
 */
export async function adminResetPassword(actor: Actor, userId: string, reason: string): Promise<string> {
  requirePermission(actor, "staff.manage");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  if (actor.id === userId) throw new DomainError("SELF", "Utilisez votre propre espace pour changer votre mot de passe.");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const temp = Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join("") + String(randomInt(10));
  const passwordHash = await bcrypt.hash(temp, 12);
  await inTransaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u) throw new DomainError("NOT_FOUND", "Utilisateur introuvable.");
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId } });
    await audit(tx, actor, { action: "user.password.reset", entityType: "User", entityId: userId, reason });
  });
  return temp;
}

/** Changement de son propre mot de passe (tout utilisateur connecté). */
export async function changeOwnPassword(userId: string, current: string, next: string) {
  const err = validatePassword(next);
  if (err) throw new DomainError("WEAK_PASSWORD", err);
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || !(await bcrypt.compare(current, u.passwordHash))) throw new DomainError("BAD_CREDENTIALS", "Mot de passe actuel incorrect.");
  const passwordHash = await bcrypt.hash(next, 12);
  await inTransaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await audit(tx, { id: userId, role: u.role }, { action: "user.password.change", entityType: "User", entityId: userId });
  });
}
