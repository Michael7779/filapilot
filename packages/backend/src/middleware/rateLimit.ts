import rateLimit from "express-rate-limit";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

// Anmeldeversuche bei der Bambu-Cloud ueber FilaPilot: streng begrenzt, damit sich der Import nicht zum Durchprobieren von
// Bambu-Passwoertern missbrauchen laesst. Eine Fabrik, damit sich die Begrenzung mit kleinem Limit testen laesst.
export function createBambuRateLimiter(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false
  });
}

// In der Testumgebung sehr grosszuegig, damit die vielen Testaufrufe nicht ausgebremst werden; die Begrenzung selbst
// prueft ein eigener Test mit kleinem Limit.
export const bambuRateLimiter = createBambuRateLimiter(process.env.NODE_ENV === "test" ? 10_000 : 10);
