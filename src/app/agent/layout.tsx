import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role !== "AGENT") redirect(user.role === "INVESTOR" ? "/espace" : "/admin");
  return <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>;
}
