import type { Agent, Country } from "@prisma/client";
import type { ActionState } from "@/lib/actions";
import { AGENT_STATUS_LABELS } from "@/lib/domain/deposit";
import { ActionForm, Field, TextArea } from "./action-form";

type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;

export function AgentForm({ action, countries, agent, submitLabel }: { action: Act; countries: Country[]; agent?: Agent; submitLabel: string }) {
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      {agent && <input type="hidden" name="agentId" value={agent.id} />}
      {!agent && (
        <>
          <Field label="E-mail du compte agent" name="email" type="email" required
            hint="Compte existant (sans investissement) ou nouveau compte, créé avec un mot de passe temporaire." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prénom (nouveau compte)" name="firstName" />
            <Field label="Nom (nouveau compte)" name="lastName" />
          </div>
        </>
      )}
      <Field label="Nom affiché aux investisseurs" name="displayName" defaultValue={agent?.displayName} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="countryCode">Pays</label>
          <select id="countryCode" name="countryCode" className="input" defaultValue={agent?.countryCode ?? "TG"}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </div>
        <Field label="Ville" name="city" defaultValue={agent?.city} required />
        <Field label="Zone / quartier" name="zone" defaultValue={agent?.zone ?? ""} />
        <Field label="Horaires" name="hours" defaultValue={agent?.hours ?? ""} placeholder="Lun–Sam, 8h–19h" />
      </div>
      <Field label="Contact d'assistance (contrôlé par la plateforme)" name="supportContact" defaultValue={agent?.supportContact ?? ""} />
      <TextArea label="Instructions affichées aux investisseurs" name="instructions" defaultValue={agent?.instructions ?? ""} rows={2} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="status">Statut</label>
          <select id="status" name="status" className="input" defaultValue={agent?.status ?? "ACTIVE"}>
            {Object.entries(AGENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" name="canDeposit" defaultChecked={agent?.canDeposit ?? true} /> Autorisé à recevoir des dépôts</label>
      </div>
      {agent && <TextArea label="Motif de la modification" name="reason" rows={2} required />}
    </ActionForm>
  );
}
