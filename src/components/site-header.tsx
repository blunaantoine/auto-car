import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/actions/auth";
import { MobileTabBar } from "@/components/mobile-tab-bar";

const NAV_CLS = "rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-accent-soft hover:text-ink";

export async function SiteHeader() {
  const user = await getCurrentUser();

  const tabs: { href: string; label: string }[] = [
    { href: "/", label: "Accueil" },
    { href: "/vehicules", label: "Véhicules" },
    { href: "/comment-ca-marche", label: "Guide" },
  ];
  if (user?.role === "AGENT") tabs.push({ href: "/agent", label: "Espace agent" });
  else if (user && can(user.role, "backoffice.access")) tabs.push({ href: "/admin", label: "Admin" });
  else if (user) tabs.push({ href: "/espace", label: "Mon espace" });
  else tabs.push({ href: "/connexion", label: "Connexion" });

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 lg:h-16">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-ink to-accent text-xs font-bold text-white shadow-sm" aria-hidden>
              IG
            </span>
            INTERGLOBE
          </Link>
          <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
            <Link href="/vehicules" className={NAV_CLS}>Véhicules</Link>
            <Link href="/comment-ca-marche" className={NAV_CLS}>Comment ça marche</Link>
            <Link href="/risques" className={NAV_CLS}>Risques</Link>
            {user && user.role !== "AGENT" && <Link href="/espace" className={NAV_CLS}>Mon espace</Link>}
            {user?.role === "AGENT" && <Link href="/agent" className={NAV_CLS}>Espace agent</Link>}
            {user && can(user.role, "backoffice.access") && <Link href="/admin" className={NAV_CLS}>Administration</Link>}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm font-medium text-muted md:inline">{user.firstName}</span>
                <form action={logoutAction}>
                  <button className="btn-ghost px-3 py-1.5 text-xs sm:text-sm">Déconnexion</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/connexion" className="btn-ghost px-3 py-1.5 text-xs sm:text-sm">Connexion</Link>
                <Link href="/inscription" className="btn-primary px-3 py-1.5 text-xs sm:text-sm">Créer un compte</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <MobileTabBar tabs={tabs} />
    </>
  );
}
