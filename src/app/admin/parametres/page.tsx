import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { LOSS_RULE_LABELS, LOSS_RULES } from "@/lib/domain/profit-sharing";
import { getAllSettings } from "@/lib/services/settings";
import { formatMoney } from "@/lib/money";
import { countryAction, settingAction } from "@/app/actions/admin";
import { addRateAction } from "@/app/actions/deposits";
import { formatDateTime } from "@/lib/labels";
import { ActionForm, Field } from "@/components/action-form";
import { Badge, KeyValue, Notice, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const actor = await requireActor("backoffice.access");
  const [settings, countries, rates] = await Promise.all([
    getAllSettings(),
    prisma.country.findMany({ orderBy: { name: "asc" } }),
    prisma.exchangeRate.findMany({ orderBy: { effectiveAt: "desc" }, take: 30 }),
  ]);
  const canEdit = can(actor.role, "settings.manage");
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Valeurs à trancher avant la mise en production (CDC §22), modifiables et journalisées." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Règles financières">
          <KeyValue items={[
            ["Règle de traitement des pertes", <Badge key="l" tone={settings.LOSS_RULE === "UNSET" ? "warning" : "success"}>{settings.LOSS_RULE}</Badge>],
            ["Dépôt minimum", formatMoney(settings.MIN_DEPOSIT)],
            ["Investissement minimum", formatMoney(settings.MIN_INVESTMENT)],
            ["Version des conditions", settings.TERMS_VERSION],
            ["Seuil de validation financière des dépôts", formatMoney(settings.DEPOSIT_REVIEW_THRESHOLD)],
            ["Expiration d'une demande de dépôt", `${settings.DEPOSIT_EXPIRY_HOURS} h`],
          ]} />
          {settings.LOSS_RULE === "UNSET" && <div className="mt-4"><Notice tone="warning">Aucune règle de perte approuvée : la clôture d&apos;une opération déficitaire est bloquée.</Notice></div>}
          {canEdit ? (
            <ActionForm action={settingAction} submitLabel="Enregistrer" className="mt-5 space-y-3 border-t border-line pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="key">Paramètre</label>
                  <select id="key" name="key" className="input">
                    <option value="LOSS_RULE">Règle de perte</option>
                    <option value="MIN_DEPOSIT">Dépôt minimum</option>
                    <option value="MIN_INVESTMENT">Investissement minimum</option>
                    <option value="TERMS_VERSION">Version des conditions</option>
                    <option value="DEPOSIT_REVIEW_THRESHOLD">Seuil de validation des dépôts (FCFA)</option>
                    <option value="DEPOSIT_EXPIRY_HOURS">Expiration des demandes de dépôt (heures)</option>
                  </select>
                </div>
                <Field label="Valeur" name="value" required list="loss-rules" />
                <datalist id="loss-rules">{LOSS_RULES.map((r) => <option key={r} value={r}>{LOSS_RULE_LABELS[r]}</option>)}</datalist>
              </div>
              <Field label="Motif / décision de référence" name="reason" required />
              <ul className="text-xs text-muted">{LOSS_RULES.map((r) => <li key={r}><span className="font-mono">{r}</span> : {LOSS_RULE_LABELS[r]}</li>)}</ul>
            </ActionForm>
          ) : (
            <p className="mt-4 text-xs text-muted">Seul un super administrateur peut modifier ces paramètres.</p>
          )}
        </Section>

        <Section title="Taux de change">
          <p className="mb-3 text-sm text-muted">1 unité de la devise = x FCFA. XOF et XAF sont à parité fixe. Un nouveau taux s&apos;applique aux nouvelles demandes ; les demandes passées gardent leur taux.</p>
          <ul className="divide-y divide-line text-sm">
            {rates.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 py-2">
                <span><strong>1 {r.currency}</strong> = {r.rateToRef.toString()} FCFA <span className="text-xs text-muted">· {r.source}</span></span>
                <span className="text-xs text-muted">{formatDateTime(r.effectiveAt)}</span>
              </li>
            ))}
            {!rates.length && <li className="py-2 text-muted">Aucun taux saisi (seules les devises FCFA sont utilisables).</li>}
          </ul>
          {can(actor.role, "rates.manage") && (
            <ActionForm action={addRateAction} submitLabel="Ajouter le taux" className="mt-4 space-y-3 border-t border-line pt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Devise" name="currency" required maxLength={3} placeholder="GHS" />
                <Field label="1 unité = … FCFA" name="rate" required inputMode="decimal" placeholder="52.35" />
                <Field label="Source" name="source" required placeholder="BCEAO, 25/11/2026" />
              </div>
            </ActionForm>
          )}
        </Section>

        <Section title="Pays">
          <ul className="divide-y divide-line text-sm">
            {countries.map((c) => (
              <li key={c.code} className="flex items-center justify-between gap-2 py-2">
                <span>{c.flag} {c.name} <span className="text-xs text-muted">{c.code} · {c.dialCode} · {c.currency} · {c.timezone}</span></span>
                <Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Ouvert" : "Fermé"}</Badge>
              </li>
            ))}
          </ul>
          {can(actor.role, "countries.manage") && (
            <details className="mt-4 rounded-lg bg-paper p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">Ajouter ou modifier un pays</summary>
              <ActionForm action={countryAction} submitLabel="Enregistrer le pays" className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Code ISO" name="code" maxLength={2} required placeholder="TG" />
                  <Field label="Drapeau" name="flag" required placeholder="🇹🇬" />
                  <Field label="Indicatif" name="dialCode" required placeholder="+228" />
                  <Field label="Nom" name="name" required />
                  <Field label="Devise" name="currency" maxLength={3} required placeholder="XOF" />
                  <Field label="Fuseau" name="timezone" required placeholder="Africa/Lome" />
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked /> Ouvert aux inscriptions</label>
              </ActionForm>
            </details>
          )}
        </Section>
      </div>
    </>
  );
}
