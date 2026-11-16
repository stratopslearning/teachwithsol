import type { WorkspaceType } from '@/app/db/enums';

/**
 * Draft commercial catalog for workspace SKUs.
 *
 * These are **planning numbers** for local modeling / admin defaults — not
 * live Stripe prices. Pin real Stripe Price IDs via STRIPE_PRICE_CREATOR /
 * STRIPE_PRICE_BUSINESS when charging.
 *
 * Unit of sale: **active learners** in the billing period.
 * AI band: included tutor turns + SA grades + embed batches (summed units).
 */

export type WorkspaceSku = WorkspaceType;

export type PricingTierId = string;

export type PricingTier = {
  id: PricingTierId;
  label: string;
  /** Marketing/SKU surface */
  sku: WorkspaceSku;
  /** Max active learners */
  seatCap: number;
  /** Included AI units / period (0 = unlimited / not enforced) */
  aiUnitCap: number;
  /** List price in USD for the period */
  priceUsd: number;
  period: 'month' | 'year';
  billing: 'stripe' | 'invoice';
  /** Optional $/learner overage when seats exceed band (invoice SKUs) */
  overagePerLearnerUsd?: number;
  notes?: string;
};

/** Starter catalog — tune freely; create-workspace defaults pick the first tier per SKU. */
export const WORKSPACE_PRICING_CATALOG: PricingTier[] = [
  // —— Creator (self-serve) ——
  {
    id: 'creator_starter',
    label: 'Creator Starter',
    sku: 'creator',
    seatCap: 50,
    aiUnitCap: 5_000,
    priceUsd: 29,
    period: 'month',
    billing: 'stripe',
    notes: 'Indie instructor; learners free by default',
  },
  {
    id: 'creator_growth',
    label: 'Creator Growth',
    sku: 'creator',
    seatCap: 200,
    aiUnitCap: 25_000,
    priceUsd: 79,
    period: 'month',
    billing: 'stripe',
  },
  {
    id: 'creator_pro',
    label: 'Creator Pro',
    sku: 'creator',
    seatCap: 1_000,
    aiUnitCap: 100_000,
    priceUsd: 199,
    period: 'month',
    billing: 'stripe',
  },

  // —— Business (self-serve / sales-assist) ——
  {
    id: 'business_team',
    label: 'Business Team',
    sku: 'business',
    seatCap: 100,
    aiUnitCap: 20_000,
    priceUsd: 2_400,
    period: 'year',
    billing: 'stripe',
    notes: '$24 / active learner / year at band',
  },
  {
    id: 'business_growth',
    label: 'Business Growth',
    sku: 'business',
    seatCap: 500,
    aiUnitCap: 100_000,
    priceUsd: 9_000,
    period: 'year',
    billing: 'stripe',
    notes: '$18 / learner / year at band',
  },
  {
    id: 'business_scale',
    label: 'Business Scale',
    sku: 'business',
    seatCap: 2_000,
    aiUnitCap: 400_000,
    priceUsd: 28_000,
    period: 'year',
    billing: 'invoice',
    overagePerLearnerUsd: 12,
  },

  // —— Department (sales-led) ——
  {
    id: 'department_pilot',
    label: 'Department Pilot',
    sku: 'department',
    seatCap: 500,
    aiUnitCap: 75_000,
    priceUsd: 5_000,
    period: 'year',
    billing: 'invoice',
    notes: 'Time-boxed pilot / CTL',
  },
  {
    id: 'department_standard',
    label: 'Department Standard',
    sku: 'department',
    seatCap: 1_500,
    aiUnitCap: 250_000,
    priceUsd: 15_000,
    period: 'year',
    billing: 'invoice',
    overagePerLearnerUsd: 10,
    notes: '$10 / learner / year list at band',
  },
  {
    id: 'department_large',
    label: 'Department Large',
    sku: 'department',
    seatCap: 5_000,
    aiUnitCap: 800_000,
    priceUsd: 40_000,
    period: 'year',
    billing: 'invoice',
    overagePerLearnerUsd: 8,
  },

  // —— Institution (enterprise) ——
  {
    id: 'institution_band_a',
    label: 'Institution Band A',
    sku: 'institution',
    seatCap: 2_000,
    aiUnitCap: 400_000,
    priceUsd: 25_000,
    period: 'year',
    billing: 'invoice',
    overagePerLearnerUsd: 10,
    notes: 'Single campus / early system',
  },
  {
    id: 'institution_band_b',
    label: 'Institution Band B',
    sku: 'institution',
    seatCap: 10_000,
    aiUnitCap: 2_000_000,
    priceUsd: 75_000,
    period: 'year',
    billing: 'invoice',
    overagePerLearnerUsd: 7,
    notes: 'Multi-dept; LTI/SSO included in motion',
  },
  {
    id: 'institution_band_c',
    label: 'Institution Band C',
    sku: 'institution',
    seatCap: 50_000,
    aiUnitCap: 10_000_000,
    priceUsd: 250_000,
    period: 'year',
    billing: 'invoice',
    overagePerLearnerUsd: 5,
    notes: 'System-wide; custom DPA / MSA',
  },
];

/** Rough COGS assumptions for margin modeling (USD). Tune from Braintrust/OpenAI bills. */
export const AI_UNIT_COGS_USD = {
  /** One tutor turn */
  tutor: 0.02,
  /** One SA grade pass */
  grade: 0.03,
  /** One embed batch unit (as recorded by recordAiUsage) */
  embed: 0.005,
} as const;

export function tiersForSku(sku: WorkspaceSku): PricingTier[] {
  return WORKSPACE_PRICING_CATALOG.filter((t) => t.sku === sku);
}

export function defaultTierForSku(sku: WorkspaceSku): PricingTier {
  const tiers = tiersForSku(sku);
  if (!tiers.length) {
    throw new Error(`No pricing tiers for sku=${sku}`);
  }
  return tiers[0];
}

export function getTier(id: PricingTierId): PricingTier | undefined {
  return WORKSPACE_PRICING_CATALOG.find((t) => t.id === id);
}

export type QuoteInput = {
  sku: WorkspaceSku;
  /** Preferred tier id; else smallest tier that fits seats, else largest */
  tierId?: PricingTierId;
  activeLearners: number;
  /** Optional estimated AI units in the period */
  aiUnits?: number;
};

export type QuoteResult = {
  tier: PricingTier;
  listPriceUsd: number;
  seatOverageUsd: number;
  estimatedAiCogsUsd: number;
  /** list + overage */
  estimatedRevenueUsd: number;
  /** revenue − AI COGS (infra ignored) */
  estimatedGrossAfterAiUsd: number;
  withinSeatBand: boolean;
  withinAiBand: boolean;
  period: 'month' | 'year';
  billing: 'stripe' | 'invoice';
};

/**
 * Quote a workspace against the draft catalog.
 * Seat overage only applies when the tier defines overagePerLearnerUsd.
 */
export function quoteWorkspace(input: QuoteInput): QuoteResult {
  const candidates = tiersForSku(input.sku);
  let tier =
    (input.tierId ? getTier(input.tierId) : undefined) ??
    candidates.find((t) => t.seatCap >= input.activeLearners) ??
    candidates[candidates.length - 1];

  if (!tier || tier.sku !== input.sku) {
    tier = defaultTierForSku(input.sku);
  }

  const extraSeats = Math.max(0, input.activeLearners - tier.seatCap);
  const seatOverageUsd =
    extraSeats > 0 && tier.overagePerLearnerUsd
      ? extraSeats * tier.overagePerLearnerUsd
      : 0;

  const aiUnits = input.aiUnits ?? 0;
  // Blend COGS: assume mix tutor-heavy; use weighted average of unit costs.
  const avgUnitCogs =
    (AI_UNIT_COGS_USD.tutor + AI_UNIT_COGS_USD.grade + AI_UNIT_COGS_USD.embed) /
    3;
  const estimatedAiCogsUsd = Math.round(aiUnits * avgUnitCogs * 100) / 100;

  const estimatedRevenueUsd = tier.priceUsd + seatOverageUsd;

  return {
    tier,
    listPriceUsd: tier.priceUsd,
    seatOverageUsd,
    estimatedAiCogsUsd,
    estimatedRevenueUsd,
    estimatedGrossAfterAiUsd:
      Math.round((estimatedRevenueUsd - estimatedAiCogsUsd) * 100) / 100,
    withinSeatBand: input.activeLearners <= tier.seatCap,
    withinAiBand: !tier.aiUnitCap || aiUnits <= tier.aiUnitCap,
    period: tier.period,
    billing: tier.billing,
  };
}
