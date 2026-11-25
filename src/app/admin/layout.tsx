import { requireActor } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { NavTabs } from "@/components/nav-tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("backoffice.access");
  const links: [string, string, boolean][] = [
    ["/admin", "Tableau de bord", true],
    ["/admin/operations", "Opérations", true],
    ["/admin/utilisateurs", "Investisseurs", can(actor.role, "users.manage") || can(actor.role, "wallet.credit")],
    ["/admin/depots", "Dépôts", true],
    ["/admin/agents", "Agents", true],
    ["/admin/grand-livre", "Grand livre", can(actor.role, "ledger.read")],
    ["/admin/journal", "Journal d'audit", can(actor.role, "audit.read")],
    ["/admin/parametres", "Paramètres", true],
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
      <aside className="mb-6 lg:mb-0">
        <div className="mb-4 rounded-2xl bg-linear-to-br from-ink to-ink-soft px-3.5 py-3 text-xs text-white shadow-card">
          <div className="font-semibold">{actor.user.firstName} {actor.user.lastName}</div>
          <div className="mt-0.5 text-white/70">{ROLE_LABELS[actor.role]}</div>
        </div>
        <NavTabs ariaLabel="Administration" variant="sidebar" links={links.filter(([, , ok]) => ok).map(([href, label]) => [href, label] as [string, string])} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
