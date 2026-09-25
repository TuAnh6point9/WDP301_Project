export type UserStatus = 'active' | 'off' | 'pending';
export type UserAccount = { initials: string; name: string; email: string; role: 'Admin' | 'User'; platform: 'Web' | 'Mobile'; lastActive: string | null; status: UserStatus; avatar?: 'warn' };
export type UserInput = Pick<UserAccount, 'name' | 'email' | 'initials' | 'role' | 'platform' | 'status'>;
