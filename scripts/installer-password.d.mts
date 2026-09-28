/** Types for installer-password.mjs (plain JS, so the npm scripts run without a build). */
export const ROUNDS: number;
export function passwordHash(salt: string, password: string, rounds?: number): string;
