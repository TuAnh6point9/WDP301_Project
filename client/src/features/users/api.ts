import { USER_MESSAGES as M } from '@wqi/contracts';
// Account management for admins (UC13).
// Backend endpoints: GET /users, POST /users, PATCH /users/:id.
// TODO(BE): replace each body with a call through lib/http once the endpoint exists.
import type { UserAccount, UserInput } from './types';

export async function listUsers(): Promise<UserAccount[]> {
  return [];
}

export async function createUser(_input: UserInput): Promise<UserAccount> {
  throw new Error(M.ACCOUNTS_UNAVAILABLE);
}

/** Resolves the saved fields; the caller merges them into the account it already holds. */
export async function updateUser(_input: UserInput): Promise<UserInput> {
  throw new Error(M.ACCOUNTS_UNAVAILABLE);
}
