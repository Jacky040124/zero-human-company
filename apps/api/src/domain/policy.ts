export type PricePolicyInput = {
  offeredPrice: number
  floorPrice: number
  currency: string
  unit: string
}

export type PricePolicyDecision =
  | { outcome: 'ALLOW'; reason: string }
  | { outcome: 'PAUSE'; reason: 'POLICY_BELOW_FLOOR'; summary: string }

export function evaluatePricePolicy(input: PricePolicyInput): PricePolicyDecision {
  if (!Number.isFinite(input.offeredPrice) || !Number.isFinite(input.floorPrice)) {
    throw new Error('Prices must be finite numbers')
  }
  if (input.offeredPrice < input.floorPrice) {
    return {
      outcome: 'PAUSE',
      reason: 'POLICY_BELOW_FLOOR',
      summary: `Offer ${input.currency} ${input.offeredPrice}/${input.unit} is below the approved floor`,
    }
  }
  return {
    outcome: 'ALLOW',
    reason: `Offer meets the ${input.currency} ${input.floorPrice}/${input.unit} floor`,
  }
}
