import Link from "next/link";
import type { DepositStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { DEPOSIT_STATUS_LABELS } from "@/lib/domain/deposit";
import { formatDateTime } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { expireStaleDeposits } from "@/lib/services/deposits";
import { getSetting } from "@/lib/services/settings";
import { PROOF_BUCKET, signedUrl } from "@/lib/storage";
import { financeDepositAction } from "@/app/actions/deposits";
import { ActionForm } from "@/components/action-form";
import { Badge, Empty, Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dépôts" };

const FILTERS: Record<string, { label: string; statuses: DepositStatus[] }> = {
  "a-valider": { label: "À valider", statuses: ["CONFIRMED_BY_AGENT", "DISPUTED"] },
  attente: { label: "Chez l'agent", statuses: ["AWAITING_AGENT"] },
  credites: { label: "Crédités", statuses: ["CREDITED"] },
  clos: { label: "Rejetés / expirés / annulés", statuses: ["REJECTED", "EXPIRED", "CANCELLED"] },
};
const localMoney = (n: bigint, cur: string) => formatMoney(n, cur === "XOF" || cur === "XAF" ? "FCFA" : cur);

const RESULTS: Record<string, string> = { validate: "Dépôt validé et crédité.", reject: "Dépôt rejeté.", dispute: "Dépôt placé en litige." };

export default async function Deposits({ searchParams }: { searchParams: Promise<{ filtre?: string; resultat?: string }> }) {
  const actor = await requireActor("backoffice.access");
  const { filtre, resultat } = await searchParams;
  const active = filtre && FILTERS[filtre] ? filtre : "a-valider";
  await expireStaleDeposits();
  const [deposits, threshold] = await Promise.all([
    prisma.depositRequest.findMany({ where: { status: { in: FILTERS[active].statuses } }, include: { user: true, agent: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    getSetting("DEPOSIT_REVIEW_THRESHOLD"),
  ]);
  const proofs = new Map<string, string | null>();
  for (const d of deposits) if (d.proofPath) proofs.set(d.id, await signedUrl(PROOF_BUCKET, d.proofPath));
  const review = can(actor.role, "deposits.review");

  return (
    <>
      <PageHeader title="Dépôts par agents" subtitle={`Au-delà de ${formatMoney(BigInt(threshold))}, un dépôt confirmé par l'agent doit être validé ici avant crédit.`} />
      {resultat && RESULTS[resultat] && <div className="mb-4"><Notice tone="success">{RESULTS[resultat]}</Notice></div>}
      <nav className="mb-4 flex gap-2 overflow-x-auto">
        {Object.entries(FILTERS).map(([k, f]) => (
          <Link key={k} href={`/admin/depots?filtre=${k}`} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ring-1 ring-inset ${k === active ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>{f.label}</Link>
        ))}
      </nav>
      {deposits.length ? (
        <div className="space-y-3">
          {deposits.map((d) => (
            <article key={d.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{d.reference}</span>
                    <Badge tone={d.status === "CREDITED" ? "success" : d.status === "DISPUTED" || d.status === "REJECTED" ? "danger" : "warning"}>{DEPOSIT_STATUS_LABELS[d.status]}</Badge>
                  </div>
                  <div className="mt-1"><strong>{d.user.firstName} {d.user.lastName}</strong> → <Link href={`/admin/agents/${d.agentId}`} className="text-accent hover:underline">{d.agent.displayName}</Link></div>
                  <div className="text-xs text-muted">
                    {d.provider} · réf. payeur <span className="font-mono">{d.payerReference}</span>{d.agentReference ? <> · réf. agent <span className="font-mono">{d.agentReference}</span></> : null}
                    {" "}· déclaré {formatDateTime(d.createdAt)}{d.confirmedAt ? ` · confirmé ${formatDateTime(d.confirmedAt)}` : ""}
                  </div>
                  {(d.agentNote || d.reviewNote || d.rejectReason) && <div className="mt-1 text-xs">{d.rejectReason ?? d.reviewNote ?? d.agentNote}</div>}
                  {proofs.get(d.id) && <a href={proofs.get(d.id)!} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-accent">Voir la capture</a>}
                </div>
                <div className="text-right text-sm">
                  <div className="tabular-nums">{localMoney(d.amountLocal, d.currency)} − {localMoney(d.feeLocal, d.currency)} de frais</div>
                  {d.currency !== "XOF" && <div className="text-xs text-muted">taux {d.rate.toString()} ({d.rateSource})</div>}
                  <div className="text-lg font-bold tabular-nums text-ink">{formatMoney(d.amountCredited)}</div>
                </div>
              </div>
              {review && ["CONFIRMED_BY_AGENT", "DISPUTED", "AWAITING_AGENT"].includes(d.status) && (
                <ActionForm action={financeDepositAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="depositId" value={d.id} />
                  <input type="hidden" name="filtre" value={active} />
                  <input name="note" className="input max-w-sm py-1.5" placeholder="Note / motif (obligatoire pour rejeter ou mettre en litige)" />
                  {d.status !== "AWAITING_AGENT" && d.confirmedAt && <button name="decision" value="VALIDATE" className="btn-accent px-3 py-1.5">Valider et créditer</button>}
                  {d.status !== "DISPUTED" && <button name="decision" value="DISPUTE" className="btn-ghost px-3 py-1.5">Mettre en litige</button>}
                  <button name="decision" value="REJECT" className="btn-danger px-3 py-1.5">Rejeter</button>
                </ActionForm>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>Aucun dépôt dans cette catégorie.</Empty>
      )}
    </>
  );
}
