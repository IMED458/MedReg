import { db } from '../storage/db';
import { SafeUser, User } from '../models/types';
import { generateUuid } from '../utils/caseLogic';

async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}::${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    position: user.position,
    department: user.department,
    phone: user.phone,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: false,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export interface IAuthAdapter {
  readonly mode: 'local';
  ensureInitialAdmin(): Promise<void>;
  login(username: string, password: string): Promise<SafeUser>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<SafeUser>;
  changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  setUserPasswordAdmin(targetUserId: string, newPassword: string, adminUserId: string): Promise<void>;
  createLocalPasswordRecord(password: string): Promise<{ passwordHash: string; passwordSalt: string }>;
  createUserAccount(username: string, password: string): Promise<{ id: string; passwordHash: string; passwordSalt: string }>;
}

/**
 * The app intentionally has no authentication gate. A local administrator
 * identity is selected automatically so refreshes always open the workspace.
 */
class OpenAccessAdapter implements IAuthAdapter {
  readonly mode = 'local' as const;

  async ensureInitialAdmin(): Promise<void> {
    const activeAdmin = await db.users.filter((user) => user.role === 'admin' && user.isActive && !user.deletedAt).first();
    if (activeAdmin) return;
    const now = new Date().toISOString();
    const id = 'open-access-admin';
    const { passwordHash, passwordSalt } = await this.createLocalPasswordRecord('imed458');
    await db.users.put({
      id,
      username: 'imedo',
      passwordHash,
      passwordSalt,
      fullName: 'იმედო (ადმინისტრატორი)',
      position: 'სისტემის ადმინისტრატორი',
      department: 'სამედიცინო საქმიანობის კონტროლის სამსახური',
      phone: '',
      role: 'admin',
      isActive: true,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      createdBy: id,
      updatedBy: id,
    });
  }

  async getCurrentUser(): Promise<SafeUser> {
    await this.ensureInitialAdmin();
    const user = await db.users.filter((item) => item.role === 'admin' && item.isActive && !item.deletedAt).first();
    if (!user) throw new Error('ადმინისტრატორის პროფილი ვერ შეიქმნა.');
    return toSafeUser(user);
  }

  async login(): Promise<SafeUser> {
    return this.getCurrentUser();
  }

  async logout(): Promise<void> {
    // Open-access mode has no session to terminate.
  }

  async createLocalPasswordRecord(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
    const passwordSalt = generateUuid();
    return { passwordHash: await hashPasswordWithSalt(password, passwordSalt), passwordSalt };
  }

  async createUserAccount(_username: string, password: string): Promise<{ id: string; passwordHash: string; passwordSalt: string }> {
    return { id: generateUuid(), ...(await this.createLocalPasswordRecord(password)) };
  }

  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) throw new Error('მომხმარებელი ვერ მოიძებნა.');
    if (await hashPasswordWithSalt(currentPassword, user.passwordSalt) !== user.passwordHash) {
      throw new Error('მიმდინარე პაროლი არასწორია.');
    }
    await this.setUserPasswordAdmin(userId, newPassword, userId);
  }

  async setUserPasswordAdmin(targetUserId: string, newPassword: string, adminUserId: string): Promise<void> {
    if (newPassword.trim().length < 6) throw new Error('პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს.');
    const credentials = await this.createLocalPasswordRecord(newPassword);
    await db.users.update(targetUserId, {
      ...credentials,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
      updatedBy: adminUserId,
    });
  }
}

export const authService: IAuthAdapter = new OpenAccessAdapter();
