/**
 * JWT Token Generation Utility for Open Agent Platform
 * 
 * This utility generates JWT tokens for authenticating requests to backend services.
 * Tokens are generated per user session and include user details.
 */

import { SignJWT } from "jose";

// Token cache to store tokens per session
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Generate a JWT token for a user session
 * 
 * @param userId - Unique identifier for the user
 * @param email - User's email address
 * @param additionalClaims - Any additional claims to include in the token
 * @returns JWT token string
 */
export async function generateJWTToken(
  userId: string,
  email: string,
  additionalClaims?: Record<string, any>
): Promise<string> {
  const secretKey = process.env.JWT_SECRET_KEY;
  const algorithm = process.env.JWT_ALGORITHM || "HS256";

  if (!secretKey) {
    throw new Error("JWT_SECRET_KEY environment variable is not set");
  }

  // Check if we have a valid cached token for this user
  const cacheKey = `${userId}:${email}`;
  const cached = tokenCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // Create token payload
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 24 * 60 * 60; // 24 hours in seconds
  const expiresAt = now + expiresIn;

  const payload = {
    user_id: userId,
    email: email,
    iat: now,
    exp: expiresAt,
    ...additionalClaims,
  };

  // Generate JWT token using jose library
  const secret = new TextEncoder().encode(secretKey);
  
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: algorithm as any })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(secret);

  // Cache the token
  tokenCache.set(cacheKey, {
    token,
    expiresAt: expiresAt * 1000, // Convert to milliseconds
  });

  return token;
}

/**
 * Clear cached token for a user
 * 
 * @param userId - User ID
 * @param email - User email
 */
export function clearCachedToken(userId: string, email: string): void {
  const cacheKey = `${userId}:${email}`;
  tokenCache.delete(cacheKey);
}

/**
 * Clear all cached tokens
 */
export function clearAllCachedTokens(): void {
  tokenCache.clear();
}
