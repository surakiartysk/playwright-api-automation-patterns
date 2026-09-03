import { userByRole } from '@gear-rental/shared-contract'
import type { Role } from '@gear-rental/shared-contract'

/**
 * Mints a token that is already past its expiry.
 *
 * Testing the expiry path needs a token the API would never issue, so the test
 * has to construct one. That is only possible because the mock uses a plain
 * encoded payload rather than a signed JWT — a deliberate trade recorded in the
 * contract: signing would buy no coverage while making this case untestable
 * without either waiting an hour or holding the signing key.
 *
 * Against a real signed API this test would be replaced by a short-TTL account
 * or a server-side clock hook; the point being demonstrated is that the case is
 * covered at all, since an expiry check nothing exercises can be deleted
 * silently.
 */
export function expiredToken(role: Role = 'staff'): string {
  const user = userByRole(role)
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() - 60_000,
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/**
 * Mints a well-formed, unexpired token for an account that does not exist.
 *
 * The gap this closes: every other token test fails on *shape* — no token, not
 * base64, past its expiry. None of them reach the check that the subject is a
 * real account, so that check could be deleted with all 92 tests still green.
 * Verified by deleting it.
 *
 * The distinction matters beyond this mock. A token whose signature verifies
 * but whose subject was since deleted is a real situation — a departed
 * employee's session outliving their account — and "the token parses" is not
 * the same question as "this is still somebody".
 */
export function unknownSubjectToken(role: Role = 'staff'): string {
  const user = userByRole(role)
  const payload = {
    sub: 'usr_does_not_exist',
    email: user.email,
    role: user.role,
    exp: Date.now() + 60_000,
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}
