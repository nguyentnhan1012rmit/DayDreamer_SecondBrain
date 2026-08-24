import { isSupabaseEmailVerified } from './supabase-email-verification';

describe('Supabase email verification claims', () => {
  it('does not trust user-controlled metadata', () => {
    expect(
      isSupabaseEmailVerified({
        user_metadata: { email_verified: true },
      }),
    ).toBe(false);
  });

  it('accepts provider-controlled verification claims', () => {
    expect(isSupabaseEmailVerified({ email_verified: true })).toBe(true);
    expect(
      isSupabaseEmailVerified({
        app_metadata: { email_verified: true },
      }),
    ).toBe(true);
    expect(
      isSupabaseEmailVerified({
        email_confirmed_at: '2026-08-24T00:00:00.000Z',
      }),
    ).toBe(true);
  });
});
