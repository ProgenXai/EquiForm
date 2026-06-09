/**
 * One-time script: create all 12 EquiForm credit packs in Stripe test mode.
 *
 * Run locally:
 *   npx ts-node --project tsconfig.json scripts/create-stripe-test-products.ts
 *
 * Requires STRIPE_SECRET_KEY in environment or .env.local (use a test/sandbox key).
 */

import * as fs from "fs";
import * as path from "path";

import Stripe from "stripe";

type ReportPackType = "single_view" | "full_report";

type ProductDefinition = {
  packId: string;
  name: string;
  unitAmountCents: number;
  reportType: ReportPackType;
  rosettes: number;
};

const PRODUCTS: ProductDefinition[] = [
  {
    packId: "sv-1",
    name: "Single View Full Report — 1 Report",
    unitAmountCents: 1500,
    reportType: "single_view",
    rosettes: 1,
  },
  {
    packId: "sv-3",
    name: "Single View Full Report — 3 Reports",
    unitAmountCents: 3800,
    reportType: "single_view",
    rosettes: 3,
  },
  {
    packId: "sv-5",
    name: "Single View Full Report — 5 Reports",
    unitAmountCents: 6000,
    reportType: "single_view",
    rosettes: 5,
  },
  {
    packId: "sv3d-1",
    name: "Single View Full Report + 3D — 1 Report",
    unitAmountCents: 2000,
    reportType: "single_view",
    rosettes: 1,
  },
  {
    packId: "sv3d-3",
    name: "Single View Full Report + 3D — 3 Reports",
    unitAmountCents: 5000,
    reportType: "single_view",
    rosettes: 3,
  },
  {
    packId: "sv3d-5",
    name: "Single View Full Report + 3D — 5 Reports",
    unitAmountCents: 8000,
    reportType: "single_view",
    rosettes: 5,
  },
  {
    packId: "fv-1",
    name: "Four-View Full Report — 1 Report",
    unitAmountCents: 2500,
    reportType: "full_report",
    rosettes: 1,
  },
  {
    packId: "fv-3",
    name: "Four-View Full Report — 3 Reports",
    unitAmountCents: 6300,
    reportType: "full_report",
    rosettes: 3,
  },
  {
    packId: "fv-5",
    name: "Four-View Full Report — 5 Reports",
    unitAmountCents: 10000,
    reportType: "full_report",
    rosettes: 5,
  },
  {
    packId: "fv3d-1",
    name: "Four-View Full Report + 3D — 1 Report",
    unitAmountCents: 3000,
    reportType: "full_report",
    rosettes: 1,
  },
  {
    packId: "fv3d-3",
    name: "Four-View Full Report + 3D — 3 Reports",
    unitAmountCents: 7500,
    reportType: "full_report",
    rosettes: 3,
  },
  {
    packId: "fv3d-5",
    name: "Four-View Full Report + 3D — 5 Reports",
    unitAmountCents: 12000,
    reportType: "full_report",
    rosettes: 5,
  },
];

type CreatedProduct = {
  packId: string;
  name: string;
  priceDisplay: string;
  productId: string;
  priceId: string;
};

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const vars: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  return vars;
}

function getStripeSecretKey(): string {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const secretKey =
    process.env.STRIPE_SECRET_KEY?.trim() || fileEnv.STRIPE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY in environment or .env.local",
    );
  }

  return secretKey;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function createProductWithPrice(
  stripe: InstanceType<typeof Stripe>,
  definition: ProductDefinition,
): Promise<CreatedProduct> {
  const metadata = {
    packId: definition.packId,
    reportType: definition.reportType,
    rosettes: String(definition.rosettes),
  };

  const product = await stripe.products.create({
    name: definition.name,
    metadata,
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: definition.unitAmountCents,
    currency: "usd",
    metadata,
  });

  const created: CreatedProduct = {
    packId: definition.packId,
    name: definition.name,
    priceDisplay: formatUsd(definition.unitAmountCents),
    productId: product.id,
    priceId: price.id,
  };

  console.log(
    `Created ${definition.packId}: ${definition.name} (${created.priceDisplay})`,
  );
  console.log(`  product_id: ${created.productId}`);
  console.log(`  price_id:   ${created.priceId}`);
  console.log("");

  return created;
}

async function main() {
  const secretKey = getStripeSecretKey();

  if (!secretKey.startsWith("sk_test_")) {
    console.warn(
      "Warning: STRIPE_SECRET_KEY does not look like a test key (expected sk_test_...).",
    );
  }

  const stripe = new Stripe(secretKey);
  const created: CreatedProduct[] = [];

  console.log("Creating EquiForm Stripe test products...\n");

  for (const definition of PRODUCTS) {
    created.push(await createProductWithPrice(stripe, definition));
  }

  console.log("=".repeat(72));
  console.log(`Summary: created ${created.length} products\n`);

  const packIdWidth = Math.max(...created.map((row) => row.packId.length));
  const priceIdWidth = Math.max(...created.map((row) => row.priceId.length));

  console.log(
    `${"Pack ID".padEnd(packIdWidth)}  ${"Price".padEnd(8)}  ${"Price ID".padEnd(priceIdWidth)}  Product ID`,
  );
  console.log("-".repeat(72));

  for (const row of created) {
    console.log(
      `${row.packId.padEnd(packIdWidth)}  ${row.priceDisplay.padEnd(8)}  ${row.priceId.padEnd(priceIdWidth)}  ${row.productId}`,
    );
  }

  console.log("\nDone. Update stripePriceId values in src/lib/stripe/rosette-packs.ts with the new price IDs.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
