// Données de démonstration — développement uniquement.
import bcrypt from "bcryptjs";
import { PrismaClient, type Role } from "@prisma/client";
import { getUserWallet } from "../src/lib/ledger/ledger";
import { creditDeposit } from "../src/lib/services/wallet";
import { invest } from "../src/lib/services/investment";
import {
  addExpense,
  createOperation,
  declareSale,
  publishUpdate,
  reviewExpense,
  transitionOperation,
  type OperationInput,
} from "../src/lib/services/operations";
import { claimSettlement, prepareClosure, validateClosure } from "../src/lib/services/closure";
import type { Actor } from "../src/lib/services/types";

if (process.env.NODE_ENV === "production") throw new Error("Seed interdit en production.");

const prisma = new PrismaClient();
const PASSWORD = "Demo2026interglobe";

const COUNTRIES = [
  { code: "TG", name: "Togo", flag: "🇹🇬", dialCode: "+228", currency: "XOF", timezone: "Africa/Lome" },
  { code: "BJ", name: "Bénin", flag: "🇧🇯", dialCode: "+229", currency: "XOF", timezone: "Africa/Porto-Novo" },
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", dialCode: "+225", currency: "XOF", timezone: "Africa/Abidjan" },
  { code: "SN", name: "Sénégal", flag: "🇸🇳", dialCode: "+221", currency: "XOF", timezone: "Africa/Dakar" },
  { code: "BF", name: "Burkina Faso", flag: "🇧🇫", dialCode: "+226", currency: "XOF", timezone: "Africa/Ouagadougou" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", dialCode: "+233", currency: "GHS", timezone: "Africa/Accra" },
  { code: "CM", name: "Cameroun", flag: "🇨🇲", dialCode: "+237", currency: "XAF", timezone: "Africa/Douala" },
  { code: "FR", name: "France", flag: "🇫🇷", dialCode: "+33", currency: "EUR", timezone: "Europe/Paris", active: false },
];

async function user(email: string, firstName: string, lastName: string, role: Role, countryCode = "TG"): Promise<Actor> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const u = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, firstName, lastName, role, countryCode, passwordHash, status: "ACTIVE", emailVerifiedAt: new Date(), city: "Lomé" },
  });
  await prisma.$transaction((tx) => getUserWallet(tx, u.id));
  return { id: u.id, role: u.role };
}

const op = (o: Partial<OperationInput> & Pick<OperationInput, "title" | "make" | "model">): OperationInput => ({
  description: "Véhicule acheté à un particulier après sinistre. Remise en état dans notre atelier partenaire, puis revente sur le marché local.",
  risks: "Dommages mécaniques cachés possibles derrière la face avant. Délai d'approvisionnement des pièces variable.",
  year: 2016,
  condition: "Accidenté — non roulant",
  damageDescription: "Choc avant : pare-chocs, capot, radiateur et optique droite à remplacer.",
  location: "Lomé",
  photos: [],
  acquisitionBudget: 1_500_000n,
  companyContribution: 1_000_000n,
  investorTarget: 500_000n,
  minInvestment: 2_500n,
  maxPerInvestor: null,
  estimatedDurationDays: 75,
  budgetLines: [
    { category: "ACQUISITION", label: "Acquisition", amount: 1_050_000n },
    { category: "PARTS", label: "Pièces", amount: 220_000n },
    { category: "LABOR", label: "Main-d'œuvre", amount: 120_000n },
    { category: "ADMIN_FEES", label: "Frais administratifs", amount: 40_000n },
    { category: "OTHER", label: "Marge de sécurité", amount: 70_000n },
  ],
  ...o,
});

async function main() {
  for (const c of COUNTRIES) await prisma.country.upsert({ where: { code: c.code }, update: {}, create: c });

  if (await prisma.operation.count()) {
    console.log("Base déjà initialisée : seed ignoré.");
    return;
  }

  const superAdmin = await user("super@interglobe.test", "Sika", "Mensah", "SUPER_ADMIN");
  const admin = await user("admin@interglobe.test", "Kodjo", "Agbeko", "ADMIN");
  const finance = await user("finance@interglobe.test", "Afi", "Lawson", "FINANCE");
  const finance2 = await user("finance2@interglobe.test", "Yao", "Kouassi", "FINANCE", "CI");
  const ama = await user("ama@interglobe.test", "Ama", "Dossou", "INVESTOR", "BJ");
  const koffi = await user("koffi@interglobe.test", "Koffi", "Adjovi", "INVESTOR");
  const awa = await user("awa@interglobe.test", "Awa", "Diallo", "INVESTOR", "SN");

  let ref = 1;
  for (const [u, amount] of [[ama, 900_000n], [koffi, 600_000n], [awa, 250_000n]] as const)
    await creditDeposit(finance, { userId: u.id, amount, externalReference: `SEED-MOMO-${ref++}`, reason: "Données de démonstration" });

  const key = () => `seed-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const doInvest = (u: Actor, opId: string, amount: bigint) =>
    invest({ userId: u.id, operationId: opId, amount, idempotencyKey: key(), riskAccepted: true, termsVersion: "CG-2026-11-v1" });
  const open = async (id: string) => {
    for (const s of ["IN_REVIEW", "PUBLISHED", "FUNDING_OPEN"] as const) await transitionOperation(admin, id, s);
  };

  // 1. Opération clôturée reprenant l'exemple du cahier des charges (B = 600 000)
  const closed = await createOperation(admin, op({ title: "Toyota Corolla 2016 — Lomé", make: "Toyota", model: "Corolla" }));
  await open(closed.id);
  await doInvest(ama, closed.id, 300_000n);
  await doInvest(koffi, closed.id, 200_000n);
  for (const s of ["ACQUISITION", "REPAIR", "READY_FOR_SALE", "ON_SALE"] as const) await transitionOperation(admin, closed.id, s);
  for (const [category, label, amount] of [
    ["ACQUISITION", "Achat du véhicule", 1_050_000n],
    ["PARTS", "Pare-chocs, capot, radiateur, optique", 230_000n],
    ["LABOR", "Carrosserie et peinture", 120_000n],
    ["ADMIN_FEES", "Mutation et contrôle technique", 40_000n],
    ["SALE_FEES", "Annonces et commission de vente", 60_000n],
  ] as const) {
    const e = await addExpense(admin, closed.id, { category, label, amount, incurredAt: new Date(), supplier: "Fournisseur démo", documentRef: `FACT-${ref++}` });
    await reviewExpense(finance, e.id, "APPROVED");
  }
  await publishUpdate(admin, closed.id, "Réparation terminée", "Carrosserie refaite, véhicule passé au contrôle technique sans réserve.");
  await declareSale(admin, closed.id, 2_100_000n, new Date());
  await prepareClosure(finance, closed.id);
  await validateClosure(finance2, closed.id);
  const s = await prisma.investorSettlement.findFirstOrThrow({ where: { userId: koffi.id } });
  await claimSettlement(koffi.id, s.id);

  // 2. Opération en réparation
  const repair = await createOperation(admin, op({ title: "Hyundai Tucson 2017 — Cotonou", make: "Hyundai", model: "Tucson", year: 2017, location: "Cotonou", acquisitionBudget: 2_400_000n, companyContribution: 1_600_000n, investorTarget: 800_000n, budgetLines: [] }));
  await open(repair.id);
  await doInvest(ama, repair.id, 400_000n);
  await doInvest(awa, repair.id, 150_000n);
  await doInvest(koffi, repair.id, 250_000n);
  await transitionOperation(admin, repair.id, "ACQUISITION");
  const e1 = await addExpense(admin, repair.id, { category: "ACQUISITION", label: "Achat du véhicule", amount: 1_650_000n, incurredAt: new Date() });
  await reviewExpense(finance, e1.id, "APPROVED");
  await transitionOperation(admin, repair.id, "REPAIR");
  await addExpense(admin, repair.id, { category: "PARTS", label: "Kit embrayage", amount: 185_000n, incurredAt: new Date(), supplier: "Garage partenaire" });
  await publishUpdate(admin, repair.id, "Véhicule en atelier", "Le véhicule est arrivé à l'atelier. Les pièces sont commandées.");

  // 3. Opérations ouvertes au financement
  const o3 = await createOperation(admin, op({ title: "Peugeot 301 2018 — Lomé", make: "Peugeot", model: "301", year: 2018, acquisitionBudget: 1_800_000n, companyContribution: 1_200_000n, investorTarget: 600_000n, maxPerInvestor: 200_000n, budgetLines: [] }));
  await open(o3.id);
  await doInvest(awa, o3.id, 50_000n);
  const o4 = await createOperation(admin, op({ title: "Kia Rio 2015 — Kara", make: "Kia", model: "Rio", year: 2015, location: "Kara", acquisitionBudget: 950_000n, companyContribution: 650_000n, investorTarget: 300_000n, budgetLines: [] }));
  await open(o4.id);

  // 4. Brouillon
  await createOperation(admin, op({ title: "Nissan Almera 2014 — Abidjan", make: "Nissan", model: "Almera", year: 2014, location: "Abidjan", budgetLines: [] }));

  console.log("\nDonnées de démonstration créées. Mot de passe commun :", PASSWORD);
  console.log("  super@interglobe.test (super admin), admin@, finance@, finance2@, ama@, koffi@, awa@interglobe.test");
  void superAdmin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
