import bcrypt from "bcryptjs";
import {
  appendUser,
  findUser,
  listUsers,
  updateUser,
  type UserRow,
} from "@/lib/sheets/client";

const COST = 12;

function pepper(): string {
  return process.env.BCRYPT_PEPPER ?? "";
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain + pepper(), COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain + pepper(), hash);
  } catch {
    return false;
  }
}

export async function getUserForLogin(email: string): Promise<UserRow | null> {
  const user = await findUser(email);
  if (!user || !user.active) return null;
  return user;
}

export async function listAllUsers(): Promise<UserRow[]> {
  return listUsers();
}

export async function createUser(input: {
  email: string;
  password: string;
  role: "owner" | "manager";
}): Promise<void> {
  const existing = await findUser(input.email);
  if (existing) throw new Error("user_exists");
  const hash = await hashPassword(input.password);
  await appendUser({
    email: input.email,
    passwordHash: hash,
    role: input.role,
    createdAt: new Date().toISOString(),
    active: true,
  });
}

export async function setRole(email: string, role: "owner" | "manager"): Promise<void> {
  const user = await findUser(email);
  if (!user) throw new Error("not_found");
  await updateUser(user.rowNumber, { role });
}

export async function setActive(email: string, active: boolean): Promise<void> {
  const user = await findUser(email);
  if (!user) throw new Error("not_found");
  await updateUser(user.rowNumber, { active });
}

export async function changePassword(email: string, newPassword: string): Promise<void> {
  const user = await findUser(email);
  if (!user) throw new Error("not_found");
  const hash = await hashPassword(newPassword);
  await updateUser(user.rowNumber, { passwordHash: hash });
}

export async function isFirstUser(): Promise<boolean> {
  const users = await listUsers();
  return users.length === 0;
}
