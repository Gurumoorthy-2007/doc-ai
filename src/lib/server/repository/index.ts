import { JsonRepository } from './JsonRepository';
import { SupabaseRepository } from './SupabaseRepository';
import type { IRepository } from './types';

export * from './types';
export { JsonRepository } from './JsonRepository';
export { SupabaseRepository } from './SupabaseRepository';

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && !url.includes('placeholder') && key && !key.includes('placeholder'));
}

let _repositoryInstance: IRepository | null = null;

/**
 * Returns the active IRepository based on environment configuration.
 *
 * Precedence:
 * 1. If DATA_STORE_TYPE is explicitly 'json' -> JsonRepository
 * 2. If DATA_STORE_TYPE is 'supabase' or Supabase is configured -> SupabaseRepository
 * 3. Default fallback (local demo, testing) -> JsonRepository
 */
export function getRepository(): IRepository {
  if (_repositoryInstance) {
    return _repositoryInstance;
  }

  const explicitType = process.env.DATA_STORE_TYPE?.toLowerCase();

  if (explicitType === 'json') {
    _repositoryInstance = new JsonRepository();
    return _repositoryInstance;
  }

  if (explicitType === 'supabase' || isSupabaseConfigured()) {
    _repositoryInstance = new SupabaseRepository();
    return _repositoryInstance;
  }

  _repositoryInstance = new JsonRepository();
  return _repositoryInstance;
}

/**
 * Reset repository instance (primarily for testing environment switching).
 */
export function resetRepositoryInstance(): void {
  _repositoryInstance = null;
}
