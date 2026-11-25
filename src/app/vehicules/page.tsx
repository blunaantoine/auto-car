import Link from "next/link";
import type { OperationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OperationCard } from "@/components/operation-card";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalogue des véhicules" };

const FILTERS: Record<string, { label: string; statuses: OperationStatus[] }> = {
  ouvertes: { label: "Financement ouvert", statuses: ["FUNDING_OPEN", "PUBLISHED"] },
  "en-cours": { label: "En cours", statuses: ["FUNDED", "ACQUISITION", "REPAIR", "READY_FOR_SALE", "ON_SALE", "SOLD", "CLOSING_PENDING"] },
  terminees: { label: "Terminées", statuses: ["CLOSED"] },
  archivees: { label: "Archivées", statuses: ["ARCHIVED"] },
};

export default async function Catalogue({ searchParams }: { searchParams: Promise<{ filtre?: string }> }) {
  const { filtre } = await searchParams;
  const active = filtre && FILTERS[filtre] ? filtre : "ouvertes";
  const ops = await prisma.operation.findMany({
    where: { status: { in: FILTERS[active].statuses } },
    include: { vehicle: true },
    orderBy: { publishedAt: "desc" },
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title="Catalogue des véhicules" subtitle="Chaque véhicule est une opération indépendante, avec son propre budget et son propre résultat." />
      <nav aria-label="Filtrer par état" className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
        {Object.entries(FILTERS).map(([key, f]) => (
          <Link
            key={key}
            href={`/vehicules?filtre=${key}`}
            aria-current={key === active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset transition ${key === active ? "bg-ink text-white shadow-sm ring-ink" : "bg-white text-gray-700 ring-line hover:bg-paper hover:text-ink"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {ops.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ops.map((op) => <OperationCard key={op.id} op={op} />)}
        </div>
      ) : (
        <Empty>Aucune opération dans cette catégorie.</Empty>
      )}
    </div>
  );
}
