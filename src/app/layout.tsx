import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "INTERGLOBE — Investissement participatif automobile", template: "%s · INTERGLOBE" },
  description: "Participez au financement d'opérations d'achat, de remise en état et de revente de véhicules.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16324f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col antialiased">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Aller au contenu
        </a>
        <SiteHeader />
        <main id="contenu" className="flex-1">{children}</main>
        <footer className="border-t border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-muted sm:grid-cols-3">
            <div>
              <div className="font-bold text-ink">INTERGLOBE</div>
              <p className="mt-2">Financement participatif d&apos;opérations automobiles : achat, remise en état, revente.</p>
            </div>
            <nav aria-label="Informations" className="flex flex-col gap-1.5">
              <Link href="/comment-ca-marche" className="hover:text-ink">Comment ça marche</Link>
              <Link href="/risques" className="hover:text-ink">Risques et conditions</Link>
              <Link href="/vehicules" className="hover:text-ink">Catalogue des véhicules</Link>
            </nav>
            <p className="text-xs leading-relaxed">
              Investir comporte un risque de perte partielle ou totale du capital. Les rendements affichés sont des
              estimations ou des résultats constatés, jamais des promesses de gains. Aucun délai de revente n&apos;est garanti.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
