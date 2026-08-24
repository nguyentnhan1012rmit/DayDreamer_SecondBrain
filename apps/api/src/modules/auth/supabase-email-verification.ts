export type SupabaseJwtPayload = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  email_confirmed_at?: unknown;
  confirmed_at?: unknown;
  user_metadata?: unknown;
  app_metadata?: unknown;
};

export function isSupabaseEmailVerified(payload: SupabaseJwtPayload) {
  return (
    payload.email_verified === true ||
    hasTruthyBooleanClaim(payload.app_metadata, 'email_verified') ||
    hasNonEmptyStringClaim(payload, 'email_confirmed_at') ||
    hasNonEmptyStringClaim(payload, 'confirmed_at')
  );
}

function hasTruthyBooleanClaim(value: unknown, key: string) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)[key] === true,
  );
}

function hasNonEmptyStringClaim(value: Record<string, unknown>, key: string) {
  const claim = value[key];
  return typeof claim === 'string' && claim.trim().length > 0;
}
