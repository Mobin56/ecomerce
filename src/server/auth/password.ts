import "server-only";
import bcrypt from "bcryptjs";

const ROUNDS = 12;

/** Admin passwords: min 10 chars (enforced in validation). Customer: min 8. */
export function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) throw new Error("Password too short");
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Constant-ish time for unknown users so login timing does not reveal valid emails. */
const DUMMY = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.ZyZq7fOkX6bQ6l5WkqF9H9u1zG1G";
export async function burnPasswordCheck(plain: string) {
  await bcrypt.compare(plain, DUMMY);
}
