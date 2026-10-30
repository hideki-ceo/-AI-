// Standard subscription price per property, including tax.
export const BASE_PRICE_JPY = 11_000;

export function monthlyPriceJpy(propertyCount: number): number {
  return Math.max(0, Math.floor(propertyCount)) * BASE_PRICE_JPY;
}

export function requiresBilling(profile: {
  is_internal_free?: boolean;
  is_free_tier?: boolean;
  is_exempt_from_billing?: boolean;
}): boolean {
  return !(
    profile.is_internal_free ||
    profile.is_free_tier ||
    profile.is_exempt_from_billing
  );
}

const SERVICEABLE_SUBSCRIPTION_STATUSES = ["active"];

export function canUseService(profile: {
  is_internal_free?: boolean;
  is_free_tier?: boolean;
  is_exempt_from_billing?: boolean;
  subscription_status: string | null;
}): boolean {
  return (
    !requiresBilling(profile) ||
    SERVICEABLE_SUBSCRIPTION_STATUSES.includes(profile.subscription_status ?? "")
  );
}
