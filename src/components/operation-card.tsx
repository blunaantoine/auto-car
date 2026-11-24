import Link from "next/link";
import type { Operation, Vehicle } from "@prisma/client";
import { formatMoney, percent } from "@/lib/money";
import { CarPlaceholder, Progress, StatusBadge } from "./ui";

export function OperationCard({ op }: { op: Operation & { vehicle: Vehicle } }) {
  const remaining = op.investorTarget - op.investorFunded;
  return (
    <Link href={`/vehicules/${op.slug}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-xs transition hover:shadow-md">
      <div className="aspect-[16/9] overflow-hidden bg-gray-100">
        {op.vehicle.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={op.vehicle.photos[0]} alt={`${op.vehicle.make} ${op.vehicle.model}`} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <CarPlaceholder label={`${op.vehicle.make} ${op.vehicle.model}`} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-ink">{op.title}</h3>
          <StatusBadge status={op.status} />
        </div>
        <p className="text-sm text-muted">
          {op.vehicle.year ?? "Année inconnue"} · {op.vehicle.condition} · {op.vehicle.location}
        </p>
        <div className="mt-auto space-y-2">
          <Progress value={op.investorFunded} max={op.investorTarget} />
          <div className="flex justify-between text-xs text-muted">
            <span>
              <strong className="text-gray-900">{formatMoney(op.investorFunded)}</strong> / {formatMoney(op.investorTarget)}
            </span>
            <span>{percent(op.investorFunded, op.investorTarget)} %</span>
          </div>
          {op.status === "FUNDING_OPEN" && <div className="text-xs font-medium text-accent">Reste à financer : {formatMoney(remaining)}</div>}
        </div>
      </div>
    </Link>
  );
}
