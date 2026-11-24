import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("backoffice.access");
  const links: [string, string, boolean][] = [
    ["/admin", "Tableau de bord", true],
    ["/admin/operations", "Opérations", true],
    ["/admin/utilisateurs", "Investisseurs", can(actor.role, "users.manage") || can(actor.role, "wallet.credit")],
    ["/admin/grand-livre", "Grand livre", can(actor.role, "ledger.read")],
    ["/admin/journal", "Journal d'audit", can(actor.role, "audit.read")],
    ["/admin/parametres", "Paramètres", true],
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:grid lg:grid-cols-[210px_1fr] lg:gap-8">
      <aside className="mb-6 lg:mb-0">
        <div className="mb-3 rounded-lg bg-ink px-3 py-2 text-xs text-white">
          <div className="font-semibold">{actor.user.firstName} {actor.user.lastName}</div>
          <div className="text-white/70">{ROLE_LABELS[actor.role]}</div>
        </div>
        <nav aria-label="Administration" className="flex gap-1 overflow-x-auto lg:flex-col">
          {links.filter(([, , ok]) => ok).map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white hover:text-ink">{label}</Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
