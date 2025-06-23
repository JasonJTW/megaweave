import crypto, { hash } from "crypto";

export function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize(), salt, 64, (error, hash) => {
      if (error) reject(error);
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
  hashedPassword: string
) {
  const inputHashedPassword = await hashPassword(password, salt);
  console.log("inputHashedPassword:", inputHashedPassword);
  console.log("hashedPassword:", hashedPassword);
  console.log("salt:", salt);
  return crypto.timingSafeEqual(
    Buffer.from(inputHashedPassword, "hex"),
    Buffer.from(hashedPassword, "hex")
  );
}
