import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "INTERGLOBE — Investissement participatif automobile", template: "%s · INTERGLOBE" },
  description: "Participez au financement d'opérations d'achat, de remise en état et de revente de véhicules.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#16324f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="flex min-h-screen flex-col antialiased">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Aller au contenu
        </a>
        <SiteHeader />
        <main id="contenu" className="flex-1">{children}</main>
        <footer className="border-t border-line/80 bg-white/80 backdrop-blur-sm">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5 font-extrabold tracking-tight text-ink">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-ink to-accent text-xs font-bold text-white shadow-sm" aria-hidden>IG</span>
                INTERGLOBE
              </div>
              <p className="mt-3 max-w-xs leading-relaxed">Financement participatif d&apos;opérations automobiles : achat, remise en état, revente.</p>
            </div>
            <nav aria-label="Informations" className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink">Navigation</div>
              <Link href="/comment-ca-marche" className="w-fit transition hover:text-accent">Comment ça marche</Link>
              <Link href="/risques" className="w-fit transition hover:text-accent">Risques et conditions</Link>
              <Link href="/vehicules" className="w-fit transition hover:text-accent">Catalogue des véhicules</Link>
            </nav>
            <p className="text-xs leading-relaxed">
              Investir comporte un risque de perte partielle ou totale du capital. Les rendements affichés sont des
              estimations ou des résultats constatés, jamais des promesses de gains. Aucun délai de revente n&apos;est garanti.
            </p>
          </div>
          <div className="border-t border-line/60 py-4 text-center text-xs text-muted">© {new Date().getFullYear()} INTERGLOBE — Tous droits réservés</div>
        </footer>
        {/* Réserve la hauteur de la barre d'onglets mobile afin que le pied de page reste lisible */}
        <div aria-hidden className="h-[calc(4.25rem+env(safe-area-inset-bottom))] lg:hidden" />
      </body>
    </html>
  );
}
