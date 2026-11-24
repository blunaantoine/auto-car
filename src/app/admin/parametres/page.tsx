import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { LOSS_RULE_LABELS, LOSS_RULES } from "@/lib/domain/profit-sharing";
import { getAllSettings } from "@/lib/services/settings";
import { formatMoney } from "@/lib/money";
import { countryAction, settingAction } from "@/app/actions/admin";
import { ActionForm, Field } from "@/components/action-form";
import { Badge, KeyValue, Notice, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const actor = await requireActor("backoffice.access");
  const [settings, countries] = await Promise.all([getAllSettings(), prisma.country.findMany({ orderBy: { name: "asc" } })]);
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
