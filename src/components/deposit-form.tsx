"use client";
import { useActionState, useMemo, useState } from "react";
import { submitDepositAction } from "@/app/actions/deposits";
import { quoteDeposit } from "@/lib/domain/deposit";
import { SubmitButton } from "./action-form";

const fmt = (n: bigint, cur: string) => `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${cur === "XOF" || cur === "XAF" ? "FCFA" : cur}`;

export function DepositForm(props: {
  methodId: string;
  currency: string;
  min: string;
  max: string | null;
  feeFixed: string;
  feeBps: number;
  rate: string;
  rateSource: string;
  minCredited: string;
  proofEnabled: boolean;
}) {
  const [state, action] = useActionState(submitDepositAction, null);
  const [raw, setRaw] = useState("");
  const amount = useMemo(() => {
    const c = raw.replace(/[\s  ]/g, "");
    return /^\d{1,15}$/.test(c) ? BigInt(c) : null;
  }, [raw]);
  const q = amount ? quoteDeposit(amount, BigInt(props.feeFixed), props.feeBps, props.rate) : null;
  const problem =
    amount === null ? null :
    amount < BigInt(props.min) ? `Minimum : ${fmt(BigInt(props.min), props.currency)}.` :
    props.max && amount > BigInt(props.max) ? `Maximum : ${fmt(BigInt(props.max), props.currency)}.` :
    q && q.amountCredited < BigInt(props.minCredited) ? `Après frais, le dépôt minimum est de ${fmt(BigInt(props.minCredited), "XOF")}.` : null;

  return (
    <form action={action} className="space-y-4" encType="multipart/form-data">
      <input type="hidden" name="methodId" value={props.methodId} />
      <div>
        <label htmlFor="amount" className="label">Montant que vous envoyez ({props.currency === "XOF" || props.currency === "XAF" ? "FCFA" : props.currency})</label>
        <input id="amount" name="amount" inputMode="numeric" autoComplete="off" required className="input text-lg" value={raw} onChange={(e) => setRaw(e.target.value)} />
        {problem && <p className="mt-1 text-sm text-red-700">{problem}</p>}
      </div>
      {q && !problem && (
        <dl className="space-y-1.5 rounded-lg bg-paper p-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Montant envoyé</dt><dd className="tabular-nums">{fmt(q.amountLocal, props.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Frais de l&apos;agent</dt><dd className="tabular-nums">− {fmt(q.feeLocal, props.currency)}</dd></div>
          {props.currency !== "XOF" && props.currency !== "XAF" && (
            <div className="flex justify-between"><dt className="text-muted">Taux appliqué</dt><dd className="tabular-nums">1 {props.currency} = {props.rate} FCFA <span className="text-xs text-muted">({props.rateSource})</span></dd></div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base"><dt className="font-semibold">Crédité sur votre portefeuille</dt><dd className="font-bold tabular-nums text-ink">{fmt(q.amountCredited, "XOF")}</dd></div>
        </dl>
      )}
      <div>
        <label htmlFor="payerReference" className="label">Référence de la transaction (donnée par l&apos;opérateur)</label>
        <input id="payerReference" name="payerReference" required minLength={4} className="input" placeholder="Ex. MP251125.1432.A12345" />
      </div>
      <div>
        <label htmlFor="payerAccount" className="label">Numéro ou compte depuis lequel vous avez payé (facultatif)</label>
        <input id="payerAccount" name="payerAccount" className="input" />
      </div>
      {props.proofEnabled && (
        <div>
          <label htmlFor="proof" className="label">Capture du paiement (facultatif)</label>
          <input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          <p className="mt-1 text-xs text-muted">JPEG, PNG ou WebP, 4 Mo maximum. Une capture seule ne suffit pas : l&apos;agent vérifie la réception réelle.</p>
        </div>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="paid" required className="mt-1 h-4 w-4" />
        <span>J&apos;ai effectué le transfert vers les coordonnées ci-dessus. Je comprends que mon portefeuille sera crédité seulement après vérification par l&apos;agent.</span>
      </label>
      {state?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <SubmitButton className="btn-accent w-full">Déclarer mon dépôt</SubmitButton>
    </form>
  );
}
