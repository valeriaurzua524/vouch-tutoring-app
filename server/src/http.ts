import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from './config.js';
import type { Queryable } from './db/index.js';

export type Role = 'student' | 'tutor' | 'admin';
export interface AuthUser {
  id: number;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', msg, details);
export const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, 'FORBIDDEN', msg);
export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (msg: string) => new HttpError(409, 'CONFLICT', msg);

/** Validates input against a zod schema or throws a 400 listing each problem. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const out = schema.safeParse(data);
  if (!out.success) {
    throw badRequest(
      'Validation failed',
      out.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return out.data;
}

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}`);
  return n;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

/** Requires a valid Bearer token; optionally restricts to the given roles. */
export function auth(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Missing bearer token');
    let claims: jwt.JwtPayload;
    try {
      claims = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
    }
    req.user = { id: Number(claims.sub), role: claims.role as Role };
    if (roles.length && !roles.includes(req.user.role)) throw forbidden(`Requires role: ${roles.join(' or ')}`);
    next();
  };
}

/**
 * Last middleware. Known errors keep their status; anything else is a 500 with
 * no internals in the body.
 */
export function errorHandler(db: Queryable) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async (err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    // Body-parser failures: malformed JSON (400), body over the size limit (413).
    if (typeof err?.type === 'string' && err.type.startsWith('entity.')) {
      const tooLarge = err.type === 'entity.too.large';
      res.status(tooLarge ? 413 : 400).json({
        error: {
          code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
          message: tooLarge ? 'Request body is too large' : 'Request body is not valid JSON',
        },
      });
      return;
    }
    // A valid token whose account no longer exists (for example after the
    // development database was reset) fails on a foreign key. Ask the client
    // to sign in again instead of reporting a server error.
    if (err?.code === '23503' && req.user) {
      const exists = await db.query('SELECT 1 FROM users WHERE id = $1', [req.user.id]).catch(() => null);
      if (exists && exists.rows.length === 0) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'This account no longer exists. Sign in again.' } });
        return;
      }
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  };
}
