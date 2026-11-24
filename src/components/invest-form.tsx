"use client";
import { useActionState, useMemo, useState } from "react";
import { investAction } from "@/app/actions/investor";
import { SubmitButton } from "./action-form";

const fmt = (n: bigint) => `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;

export function InvestForm(props: {
  operationId: string;
  idempotencyKey: string;
  min: string;
  remaining: string;
  balance: string;
  companyContribution: string;
  investorTarget: string;
}) {
  const [state, action] = useActionState(investAction, null);
  const [raw, setRaw] = useState("");
  const [step, setStep] = useState<"amount" | "recap">("amount");
  const min = BigInt(props.min);
  const remaining = BigInt(props.remaining);
  const balance = BigInt(props.balance);

  const amount = useMemo(() => {
    const c = raw.replace(/[\s  ]/g, "");
    return /^\d{1,15}$/.test(c) ? BigInt(c) : null;
  }, [raw]);

  const problem =
    amount === null ? "Saisissez un montant entier." :
    amount < min ? `Minimum : ${fmt(min)}.` :
    amount > remaining ? `Reste à financer : ${fmt(remaining)}.` :
    amount > balance ? `Solde disponible insuffisant (${fmt(balance)}).` : null;

  const E = BigInt(props.companyContribution);
  const P = BigInt(props.investorTarget);
  // part de l'enveloppe des particuliers revenant à ce montant si l'opération est financée comme prévu
  const sharePct = amount && P > 0n ? Number((amount * 10000n) / P) / 100 : 0;
  const envelopePct = E + P > 0n ? 100 - Number((E * 5000n) / (E + P)) / 100 : 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="operationId" value={props.operationId} />
      <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
      <input type="hidden" name="amount" value={amount?.toString() ?? ""} />

      <div className={step === "amount" ? "" : "hidden"}>
        <label htmlFor="amount-input" className="label">Montant à investir (FCFA)</label>
        <input
          id="amount-input"
          inputMode="numeric"
          autoComplete="off"
          className="input text-lg"
          placeholder={`Minimum ${fmt(min)}`}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          aria-describedby="amount-help"
        />
        <p id="amount-help" className="mt-1 text-xs text-muted">Solde disponible : {fmt(balance)} · Reste à financer : {fmt(remaining)}</p>
        {raw && problem && <p className="mt-2 text-sm text-red-700">{problem}</p>}
        <button type="button" className="btn-primary mt-4 w-full" disabled={!!problem} onClick={() => setStep("recap")}>
          Continuer
        </button>
      </div>

      {step === "recap" && amount && (
        <div className="space-y-4">
          <div className="rounded-lg bg-paper p-4 text-sm">
            <div className="font-semibold text-ink">Récapitulatif</div>
            <dl className="mt-2 space-y-1.5">
              <div className="flex justify-between"><dt className="text-muted">Montant investi</dt><dd className="font-semibold tabular-nums">{fmt(amount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Frais</dt><dd className="tabular-nums">0 FCFA</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Solde après opération</dt><dd className="tabular-nums">{fmt(balance - amount)}</dd></div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Règle de partage : les particuliers se partagent environ {envelopePct.toFixed(1)} % du bénéfice net (si le
              financement prévu est atteint), au prorata de leurs apports. Votre apport représenterait {sharePct.toFixed(2)} % de
              l&apos;enveloppe. Le traitement des pertes suit la règle affichée sur cette page.
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="riskAccepted" required className="mt-1 h-4 w-4 accent-[var(--color-accent)]" />
            <span>
              J&apos;ai lu les risques de cette opération. Je comprends que le capital n&apos;est pas garanti, qu&apos;aucun
              rendement ni délai n&apos;est promis, et que je peux perdre tout ou partie de mon investissement.
            </span>
          </label>
          {state?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep("amount")}>Modifier</button>
            <SubmitButton className="btn-accent flex-1">Confirmer l&apos;investissement</SubmitButton>
          </div>
        </div>
      )}
    </form>
  );
}
