import { db } from '../storage/db';
import { SafeUser, User } from '../models/types';
import { generateUuid } from '../utils/caseLogic';

const SESSION_STORAGE_KEY = 'medreg_local_session_user_id';

async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}::${password}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback only if subtle is unavailable in non-secure context
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = (h * 31 + data[i]) >>> 0;
  }
  return h.toString(16);
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
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export interface IAuthAdapter {
  readonly mode: 'local' | 'firebase';
  ensureInitialAdmin(): Promise<void>;
  login(username: string, password: string): Promise<SafeUser>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<SafeUser | null>;
  changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  setUserPasswordAdmin(targetUserId: string, newPassword: string, adminUserId: string): Promise<void>;
  createLocalPasswordRecord(password: string): Promise<{ passwordHash: string; passwordSalt: string }>;
}

export class LocalAuthAdapter implements IAuthAdapter {
  readonly mode = 'local' as const;

  async ensureInitialAdmin(): Promise<void> {
    const existingCount = await db.users.count();
    if (existingCount > 0) return;

    const now = new Date().toISOString();
    const adminId = generateUuid();
    const salt = generateUuid();
    const passwordHash = await hashPasswordWithSalt('imed458', salt);

    const adminUser: User = {
      id: adminId,
      username: 'imedo',
      passwordHash,
      passwordSalt: salt,
      fullName: 'იმედო (ადმინისტრატორი)',
      position: 'სისტემის ადმინისტრატორი',
      department: 'სამედიცინო საქმიანობის კონტროლის სამსახური',
      phone: '',
      role: 'admin',
      isActive: true,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminId,
      updatedBy: adminId,
    };

    await db.users.put(adminUser);
  }

  async createLocalPasswordRecord(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
    const salt = generateUuid();
    const passwordHash = await hashPasswordWithSalt(password, salt);
    return { passwordHash, passwordSalt: salt };
  }

  async login(username: string, password: string): Promise<SafeUser> {
    await this.ensureInitialAdmin();
    const normalized = username.trim().toLowerCase();
    if (!normalized || !password) {
      throw new Error('გთხოვთ შეიყვანოთ მომხმარებლის სახელი და პაროლი.');
    }

    const users = await db.users.toArray();
    const user = users.find((u) => u.username.toLowerCase() === normalized && !u.deletedAt);

    if (!user) {
      throw new Error('მომხმარებლის სახელი ან პაროლი არასწორია.');
    }
    if (!user.isActive) {
      throw new Error('მომხმარებლის ანგარიში დეაქტივირებულია. მიმართეთ ადმინისტრატორს.');
    }

    const computedHash = await hashPasswordWithSalt(password, user.passwordSalt);
    if (computedHash !== user.passwordHash) {
      throw new Error('მომხმარებლის სახელი ან პაროლი არასწორია.');
    }

    const now = new Date().toISOString();
    await db.users.update(user.id, { lastLoginAt: now, updatedAt: now });
    localStorage.setItem(SESSION_STORAGE_KEY, user.id);

    await db.activity_logs.put({
      id: generateUuid(),
      entityType: 'user',
      entityId: user.id,
      action: 'login',
      summary: `მომხმარებელი ${user.username} შევიდა სისტემაში (ლოკალური რეჟიმი).`,
      performedBy: user.id,
      performedByName: user.fullName,
      performedAt: now,
    });

    return toSafeUser({ ...user, lastLoginAt: now });
  }

  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  async getCurrentUser(): Promise<SafeUser | null> {
    await this.ensureInitialAdmin();
    const savedId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!savedId) return null;
    const user = await db.users.get(savedId);
    if (!user || !user.isActive || user.deletedAt) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return toSafeUser(user);
  }

  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) throw new Error('მომხმარებელი ვერ მოიძებნა.');
    const checkHash = await hashPasswordWithSalt(currentPassword, user.passwordSalt);
    if (checkHash !== user.passwordHash) {
      throw new Error('მიმდინარე პაროლი არასწორია.');
    }
    if (newPassword.trim().length < 6) {
      throw new Error('ახალი პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს.');
    }
    const { passwordHash, passwordSalt } = await this.createLocalPasswordRecord(newPassword);
    const now = new Date().toISOString();
    await db.users.update(user.id, {
      passwordHash,
      passwordSalt,
      mustChangePassword: false,
      updatedAt: now,
      updatedBy: user.id,
    });
  }

  async setUserPasswordAdmin(targetUserId: string, newPassword: string, adminUserId: string): Promise<void> {
    if (newPassword.trim().length < 6) {
      throw new Error('პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს.');
    }
    const { passwordHash, passwordSalt } = await this.createLocalPasswordRecord(newPassword);
    const now = new Date().toISOString();
    await db.users.update(targetUserId, {
      passwordHash,
      passwordSalt,
      mustChangePassword: false,
      updatedAt: now,
      updatedBy: adminUserId,
    });
  }
}

/**
 * მომავალი Firebase Auth ადაპტერის ინტერფეისი.
 */
export class FirebaseAuthAdapterStub implements IAuthAdapter {
  readonly mode = 'firebase' as const;
  async ensureInitialAdmin(): Promise<void> {}
  async login(): Promise<SafeUser> {
    throw new Error('Firebase Auth ჯერ არ არის კონფიგურირებული.');
  }
  async logout(): Promise<void> {}
  async getCurrentUser(): Promise<SafeUser | null> {
    return null;
  }
  async changeOwnPassword(): Promise<void> {
    throw new Error('Firebase Auth ჯერ არ არის კონფიგურირებული.');
  }
  async setUserPasswordAdmin(): Promise<void> {
    throw new Error('Firebase Auth ჯერ არ არის კონფიგურირებული.');
  }
  async createLocalPasswordRecord(): Promise<{ passwordHash: string; passwordSalt: string }> {
    throw new Error('Firebase Auth ჯერ არ არის კონფიგურირებული.');
  }
}

export const authService: IAuthAdapter = new LocalAuthAdapter();
