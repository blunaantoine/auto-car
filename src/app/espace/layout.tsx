import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

const LINKS = [
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
      <nav aria-label="Mon espace" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-gray-600 hover:border-accent hover:text-ink">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
