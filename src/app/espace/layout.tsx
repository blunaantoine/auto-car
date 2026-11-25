import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { NavTabs } from "@/components/nav-tabs";

const LINKS: [string, string][] = [
  ["/espace", "Portefeuille"],
  ["/espace/depot", "Dépôt"],
  ["/espace/investissements", "Mes investissements"],
  ["/espace/gains", "Mes gains"],
  ["/espace/securite", "Sécurité"],
];

export default async function SpaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.emailVerifiedAt) redirect("/verification");
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <NavTabs ariaLabel="Mon espace" links={LINKS} />
      </div>
      {children}
    </div>
  );
}
