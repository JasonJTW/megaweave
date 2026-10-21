import crypto from "crypto";

export function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize(), salt, 64, (error, hash) => {
      if (error) return reject(error);
      resolve(hash.toString("hex").normalize());
    });
  });
}

export function generateSalt() {
  return crypto.randomBytes(16).toString("hex").normalize();
}

export async function verifyPassword(
  password: string,
  salt: string,
  hashedPassword: string,
) {
  const inputHashedPassword = await hashPassword(password, salt);
  const input = Buffer.from(inputHashedPassword, "hex");
  const stored = Buffer.from(hashedPassword, "hex");
  // timingSafeEqual throws on length mismatch (e.g. corrupted/non-hex stored hash)
  if (input.length !== stored.length) return false;
  return crypto.timingSafeEqual(input, stored);
}
