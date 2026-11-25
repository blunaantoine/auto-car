import Link from "next/link";
import type { Operation, Vehicle } from "@prisma/client";
import { formatMoney, percent } from "@/lib/money";
import { CarPlaceholder, Progress, StatusBadge } from "./ui";

export function OperationCard({ op }: { op: Operation & { vehicle: Vehicle } }) {
  const remaining = op.investorTarget - op.investorFunded;
  return (
    <Link
      href={`/vehicules/${op.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line/80 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
        {op.vehicle.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={op.vehicle.photos[0]}
            alt={`${op.vehicle.make} ${op.vehicle.model}`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <CarPlaceholder label={`${op.vehicle.make} ${op.vehicle.model}`} />
        )}
        <div className="absolute right-3 top-3">
          <StatusBadge status={op.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-semibold leading-snug text-ink">{op.title}</h3>
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
          {op.status === "FUNDING_OPEN" && <div className="text-xs font-semibold text-accent">Reste à financer : {formatMoney(remaining)}</div>}
        </div>
      </div>
    </Link>
  );
}
