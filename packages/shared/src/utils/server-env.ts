export function resolveSupabaseServiceRoleKey(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
}

