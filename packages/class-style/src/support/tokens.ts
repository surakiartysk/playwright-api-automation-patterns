import { userByRole } from '@gear-rental/shared-contract'
import type { Role } from '@gear-rental/shared-contract'

/**
 * Mints a token that is already past its expiry.
 *
 * Only possible because the mock encodes its token rather than signing it — a
 * trade the contract makes deliberately: signing would prove nothing here and
 * would make this case untestable without the key or an hour of waiting.
 */
export function expiredToken(role: Role = 'staff'): string {
  const user = userByRole(role)
  const payload = { sub: user.id, email: user.email, role: user.role, exp: Date.now() - 60_000 }
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
