import { Hono } from 'hono'
import { fail, ok, validationFailed } from '../envelope'
import { asObject, validate } from '../validate'
import { issueToken } from '../auth'
import { SEED_USERS } from '../store'

export const authRoutes = new Hono()

authRoutes.post('/auth/login', async (c) => {
  const body = asObject(await c.req.json().catch(() => undefined))
  if (!body) {
    return c.json(
      ...validationFailed([{ field: '_body', rule: 'type', message: 'body must be an object' }]),
    )
  }

  const errors = validate(body, [
    { field: 'email', required: true, type: 'string' },
    { field: 'password', required: true, type: 'string', minLength: 8 },
  ])
  if (errors.length > 0) return c.json(...validationFailed(errors))

  const user = SEED_USERS.find((u) => u.email === body.email && u.password === body.password)
  if (!user) {
    // Deliberately does not distinguish "no such account" from "wrong password".
    return c.json(fail('AUTH_INVALID_CREDENTIALS', 'invalid email or password'), 401)
  }

  const { token, expiresAt } = issueToken(user)
  return c.json(
    ok({
      token,
      expiresAt,
      actor: { id: user.id, email: user.email, role: user.role },
    }),
  )
})

authRoutes.get('/health', (c) => c.json(ok({ status: 'ok' })))
