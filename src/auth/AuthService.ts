import { db } from '../storage/db';
import { SafeUser, User } from '../models/types';
import { generateUuid } from '../utils/caseLogic';
import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseAuth, firebaseConfig, firestore } from '../firebase/client';
import {
  prepareCloudWorkspace,
  saveCloudDocument,
  withoutCloudCapture,
} from '../firebase/cloudSync';

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
  createUserAccount(username: string, password: string): Promise<{ id: string; passwordHash: string; passwordSalt: string }>;
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

  async createUserAccount(username: string, password: string): Promise<{ id: string; passwordHash: string; passwordSalt: string }> {
    const credentials = await this.createLocalPasswordRecord(password);
    return { id: generateUuid(), ...credentials };
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
function usernameToEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (normalized === 'imedo') return 'imedo@medreg.local';
  const encoded = Array.from(new TextEncoder().encode(normalized))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `u_${encoded}@medreg.local`;
}

function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'auth/operation-not-allowed') {
    return 'Firebase Console-ში ჩართეთ Authentication → Email/Password ავტორიზაცია.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
    return 'მომხმარებლის სახელი ან პაროლი არასწორია.';
  }
  if (code === 'auth/too-many-requests') return 'სისტემა დროებით დაბლოკილია ბევრი მცდელობის გამო. სცადეთ მოგვიანებით.';
  if (code === 'auth/email-already-in-use') return 'ეს მომხმარებლის სახელი უკვე რეგისტრირებულია.';
  if (code === 'auth/weak-password') return 'პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს.';
  return error instanceof Error ? error.message : 'Firebase ავტორიზაცია ვერ მოხერხდა.';
}

function initialAdmin(uid: string): User {
  const now = new Date().toISOString();
  return {
    id: uid,
    username: 'imedo',
    passwordHash: '',
    passwordSalt: '',
    fullName: 'იმედო (ადმინისტრატორი)',
    position: 'სისტემის ადმინისტრატორი',
    department: 'სამედიცინო საქმიანობის კონტროლის სამსახური',
    phone: '',
    email: 'imedo@medreg.local',
    role: 'admin',
    isActive: true,
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
  };
}

export class FirebaseAuthAdapter implements IAuthAdapter {
  readonly mode = 'firebase' as const;

  async ensureInitialAdmin(): Promise<void> {
    // The first admin is securely bootstrapped during the first successful login.
  }

  async login(username: string, password: string): Promise<SafeUser> {
    const normalized = username.trim().toLowerCase();
    if (!normalized || !password) throw new Error('გთხოვთ შეიყვანოთ მომხმარებლის სახელი და პაროლი.');
    await setPersistence(firebaseAuth, browserLocalPersistence);

    let credential;
    try {
      credential = await signInWithEmailAndPassword(firebaseAuth, usernameToEmail(normalized), password);
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      const canBootstrap = normalized === 'imedo' && password === 'imed458' &&
        ['auth/invalid-credential', 'auth/user-not-found'].includes(code);
      if (!canBootstrap) throw new Error(authErrorMessage(error));
      try {
        credential = await createUserWithEmailAndPassword(firebaseAuth, usernameToEmail(normalized), password);
      } catch (createError) {
        throw new Error(authErrorMessage(createError));
      }
    }

    try {
      const profileRef = doc(firestore, 'users', credential.user.uid);
      const profileSnapshot = await getDoc(profileRef);
      let profile = profileSnapshot.exists() ? profileSnapshot.data() as User : null;
      if (!profile && normalized === 'imedo') {
        profile = initialAdmin(credential.user.uid);
        await saveCloudDocument('users', profile.id, profile);
      }
      if (!profile) {
        await signOut(firebaseAuth);
        throw new Error('მომხმარებლის პროფილი Firestore-ში ვერ მოიძებნა. მიმართეთ ადმინისტრატორს.');
      }
      if (!profile.isActive || profile.deletedAt) {
        await signOut(firebaseAuth);
        throw new Error('მომხმარებლის ანგარიში დეაქტივირებულია. მიმართეთ ადმინისტრატორს.');
      }

      const now = new Date().toISOString();
      profile = { ...profile, lastLoginAt: now, updatedAt: now };
      await saveCloudDocument('users', profile.id, profile);
      await withoutCloudCapture(async () => {
        const duplicateIds = (await db.users.where('username').equals(normalized).toArray())
          .filter((item) => item.id !== profile!.id)
          .map((item) => item.id);
        if (duplicateIds.length) await db.users.bulkDelete(duplicateIds);
        await db.users.put(profile!);
      });
      const loginLogId = generateUuid();
      await saveCloudDocument('activity_logs', loginLogId, {
        id: loginLogId,
        entityType: 'user',
        entityId: profile.id,
        action: 'login',
        summary: `მომხმარებელი ${profile.username} შევიდა სისტემაში (Firebase).`,
        performedBy: profile.id,
        performedByName: profile.fullName,
        performedAt: now,
      });
      await prepareCloudWorkspace();
      return toSafeUser(profile);
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(authErrorMessage(error));
    }
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth);
  }

  async getCurrentUser(): Promise<SafeUser | null> {
    await firebaseAuth.authStateReady();
    const authUser = firebaseAuth.currentUser;
    if (!authUser) return null;
    const snapshot = await getDoc(doc(firestore, 'users', authUser.uid));
    if (!snapshot.exists()) {
      await signOut(firebaseAuth);
      return null;
    }
    const profile = snapshot.data() as User;
    if (!profile.isActive || profile.deletedAt) {
      await signOut(firebaseAuth);
      return null;
    }
    await withoutCloudCapture(() => db.users.put(profile));
    await prepareCloudWorkspace();
    return toSafeUser(profile);
  }

  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.trim().length < 6) throw new Error('ახალი პაროლი უნდა შეიცავდეს მინიმუმ 6 სიმბოლოს.');
    const authUser = firebaseAuth.currentUser;
    if (!authUser || authUser.uid !== userId || !authUser.email) throw new Error('აქტიური სესია ვერ მოიძებნა.');
    try {
      await reauthenticateWithCredential(authUser, EmailAuthProvider.credential(authUser.email, currentPassword));
      await updatePassword(authUser, newPassword);
      const profile = await db.users.get(userId);
      if (profile) {
        const updated = { ...profile, mustChangePassword: false, updatedAt: new Date().toISOString(), updatedBy: userId };
        await saveCloudDocument('users', userId, updated);
        await withoutCloudCapture(() => db.users.put(updated));
      }
    } catch (error) {
      throw new Error(authErrorMessage(error));
    }
  }

  async setUserPasswordAdmin(): Promise<void> {
    throw new Error('სხვა მომხმარებლის პაროლის შეცვლა უსაფრთხოების გამო Firebase Console-იდან უნდა შესრულდეს.');
  }

  async createLocalPasswordRecord(): Promise<{ passwordHash: string; passwordSalt: string }> {
    return { passwordHash: '', passwordSalt: '' };
  }

  async createUserAccount(username: string, password: string): Promise<{ id: string; passwordHash: string; passwordSalt: string }> {
    const secondaryName = 'medreg-user-provisioning';
    const existing = getApps().find((item) => item.name === secondaryName);
    const secondaryApp = existing || initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, usernameToEmail(username), password);
      await signOut(secondaryAuth);
      return { id: credential.user.uid, passwordHash: '', passwordSalt: '' };
    } catch (error) {
      throw new Error(authErrorMessage(error));
    } finally {
      if (!existing) await deleteApp(secondaryApp);
    }
  }
}

export const authService: IAuthAdapter = new FirebaseAuthAdapter();
