import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/actions/auth";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-sm text-white" aria-hidden>IG</span>
          INTERGLOBE
        </Link>
        <nav aria-label="Navigation principale" className="order-3 flex w-full gap-5 overflow-x-auto text-sm font-medium text-gray-700 sm:order-none sm:w-auto">
          <Link href="/vehicules" className="whitespace-nowrap hover:text-accent">Véhicules</Link>
          <Link href="/comment-ca-marche" className="whitespace-nowrap hover:text-accent">Comment ça marche</Link>
          <Link href="/risques" className="whitespace-nowrap hover:text-accent">Risques</Link>
          {user && user.role !== "AGENT" && <Link href="/espace" className="whitespace-nowrap hover:text-accent">Mon espace</Link>}
          {user?.role === "AGENT" && <Link href="/agent" className="whitespace-nowrap hover:text-accent">Espace agent</Link>}
          {user && can(user.role, "backoffice.access") && <Link href="/admin" className="whitespace-nowrap hover:text-accent">Administration</Link>}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden text-sm text-muted md:inline">{user.firstName}</span>
              <form action={logoutAction}>
                <button className="btn-ghost px-3 py-1.5">Déconnexion</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/connexion" className="btn-ghost px-3 py-1.5">Connexion</Link>
              <Link href="/inscription" className="btn-primary px-3 py-1.5">Créer un compte</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
