import { requireActor } from "@/lib/auth/session";
import { createOperationAction } from "@/app/actions/admin";
import { OperationForm } from "@/components/operation-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Nouvelle opération" };

export default async function NewOperation() {
  await requireActor("operations.manage");
  return (
    <>
      <PageHeader title="Nouvelle opération" subtitle="L'opération est créée en brouillon. Elle devra passer en vérification puis être publiée." />
      <OperationForm action={createOperationAction} submitLabel="Créer le brouillon" />
    </>
  );
}
