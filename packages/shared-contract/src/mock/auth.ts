import type { Context, MiddlewareHandler } from 'hono'
import type { Actor, Role } from '../domain'
import { forbidden, unauthorized } from './envelope'
import { SEED_USERS } from './store'

/**
 * Token handling.
 *
 * The mock issues a base64url-encoded JSON blob, not a signed JWT. Signing
 * would add a dependency and a key to manage while proving nothing about the
 * test suite: no test asserts on cryptographic properties. What tests *do*
 * need is a token that carries a role and can be tampered with predictably —
 * which this gives.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000

interface TokenPayload {
  sub: string
  email: string
  role: Role
  exp: number
}

export function issueToken(actor: Actor): { token: string; expiresAt: string } {
  const exp = Date.now() + TOKEN_TTL_MS
  const payload: TokenPayload = { sub: actor.id, email: actor.email, role: actor.role, exp }
  const token = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return { token, expiresAt: new Date(exp).toISOString() }
}

function decodeToken(token: string): TokenPayload | undefined {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined

    const { sub, email, role, exp } = parsed as Record<string, unknown>
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof exp !== 'number') {
      return undefined
    }
    if (role !== 'member' && role !== 'staff' && role !== 'admin') return undefined
    if (!SEED_USERS.some((u) => u.id === sub)) return undefined

    return { sub, email, role, exp }
  } catch {
    return undefined
  }
}

declare module 'hono' {
  interface ContextVariableMap {
    actor: Actor
  }
}

/** Rejects anything without a live, decodable token for a known account. */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization') ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return c.json(...unauthorized())
  }

  const payload = decodeToken(token)
  if (!payload || payload.exp < Date.now()) {
    return c.json(...unauthorized())
  }

  c.set('actor', { id: payload.sub, email: payload.email, role: payload.role })
  await next()
  return undefined
}

/** Role gate. Runs after `requireAuth`, which has already set the actor. */
export const requireRole =
  (...allowed: Role[]): MiddlewareHandler =>
  async (c, next) => {
    const actor = c.get('actor')
    if (!allowed.includes(actor.role)) {
      return c.json(...forbidden(actor.role))
    }
    await next()
    return undefined
  }

export const actorOf = (c: Context): Actor => c.get('actor')
