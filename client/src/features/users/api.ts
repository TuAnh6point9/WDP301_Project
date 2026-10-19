// Account management for admins (UC13, FR-10). Backend: GET /users, POST /users, PATCH /users/:id.
import { http } from '@/lib/http';
import type { DateRange, Page } from '@/features/system/types';
import { bounds } from '@/features/system/api';
import type { NewUser, UserAccount, UserPatch } from './types';

export async function listUsers(params: DateRange & { page: number }): Promise<Page<UserAccount>> {
  return (await http.get<Page<UserAccount>>('/users', { params: { ...params, ...bounds(params.from, params.to), limit: 50 } })).data;
}

export async function createUser(input: NewUser): Promise<UserAccount> {
  return (await http.post<{ data: UserAccount }>('/users', input)).data.data;
}

export async function updateUser(id: string, patch: UserPatch): Promise<UserAccount> {
  return (await http.patch<{ data: UserAccount }>(`/users/${id}`, patch)).data.data;
}
