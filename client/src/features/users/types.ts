import type { User } from '@wqi/contracts';
export type Role = User['role'];
export type UserAccount = User & { createdAt: string };
export type NewUser = { name: string; email: string; password: string; role: Role };
export type UserPatch = Partial<{ name: string; role: Role; isActive: boolean; password: string }>;
