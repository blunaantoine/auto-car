import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { getUserBySessionToken, SESSION_TTL_MS } from "../services/auth";
import { can, type Permission } from "./permissions";
import type { Actor } from "../services/types";

export const SESSION_COOKIE = "ig_session";

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getCurrentUser(): Promise<User | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return getUserBySessionToken(token);
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

export async function requireActor(permission?: Permission): Promise<Actor & { user: User }> {
  const user = await requireUser();
  if (permission && !can(user.role, permission)) redirect("/espace");
  const { ip } = await requestMeta();
  return { id: user.id, role: user.role, ip, user };
}
