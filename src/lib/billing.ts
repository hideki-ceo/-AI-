export const BASE_PRICE_JPY = 16_500;
export const MULTI_PROPERTY_ADDON_JPY = 5_500;
export const MULTI_PROPERTY_PRICE_JPY = BASE_PRICE_JPY + MULTI_PROPERTY_ADDON_JPY;
export const MAX_PROPERTIES_PER_ACCOUNT = 5;

export function monthlyPriceJpy(propertyCount: number): number {
  const count = Math.max(0, Math.floor(propertyCount));
  if (!Number.isFinite(count)) throw new RangeError("Property count must be a finite number.");
  if (count > MAX_PROPERTIES_PER_ACCOUNT) {
    throw new RangeError(`A maximum of ${MAX_PROPERTIES_PER_ACCOUNT} properties is supported.`);
  }
  if (count === 0) return 0;
  return count === 1 ? BASE_PRICE_JPY : BASE_PRICE_JPY + MULTI_PROPERTY_ADDON_JPY;
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
