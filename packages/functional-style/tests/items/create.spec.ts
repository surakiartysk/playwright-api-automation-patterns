import { buildItemPayload } from '@services/items/factory'
import { ItemError } from '@services/items/ItemsValidator'
import { CommonError } from '@core/codes'
import { expect, test } from './fixtures'

/**
 * Isolated contract tests for `POST /items`.
 *
 * Note the division of labour in every case below: the validator asserts the
 * envelope and schema, then the test asserts the values it actually cares
 * about. Neither layer duplicates the other.
 */
test.describe('POST /items', { tag: ['@items', '@isolated'] }, () => {
  test(
    'should create an item and default its status to AVAILABLE',
    { tag: '@smoke' },
    async ({ itemsAsStaff, itemsValidator }) => {
      const payload = buildItemPayload({ category: 'climbing', dailyRateCents: 2400 })

      const response = await itemsAsStaff.createItem(payload)
      const item = await itemsValidator.expectItem(response, 201)

      expect(item).toMatchObject({
        sku: payload.sku,
        name: payload.name,
        category: 'climbing',
        dailyRateCents: 2400,
        status: 'AVAILABLE',
      })
      expect(item.id).toBeTruthy()
    },
  )

  test('should default conditionNote to an empty string when omitted', async ({
    itemsAsStaff,
    itemsValidator,
  }) => {
    const response = await itemsAsStaff.createItem(buildItemPayload())
    const item = await itemsValidator.expectItem(response, 201)

    expect(item.conditionNote).toBe('')
  })

  test('should reject a duplicate sku', async ({ itemsAsStaff, itemsValidator }) => {
    const payload = buildItemPayload()
    await itemsValidator.expectItem(await itemsAsStaff.createItem(payload), 201)

    // Same sku, different name — the sku is what must collide.
    const duplicate = await itemsAsStaff.createItem(
      buildItemPayload({ sku: payload.sku, name: `${payload.name}-again` }),
    )

    await itemsValidator.expectError(duplicate, 409, ItemError.SKU_TAKEN)
  })

  test('should forbid a member from creating an item', async ({
    itemsAsMember,
    itemsValidator,
  }) => {
    const response = await itemsAsMember.createItem(buildItemPayload())

    await itemsValidator.expectError(response, 403, CommonError.FORBIDDEN)
  })

  test.describe('validation', () => {
    test('should name every missing required field', async ({ itemsAsStaff, itemsValidator }) => {
      const response = await itemsAsStaff.createItem({} as never)

      const fields = await itemsValidator.expectValidationError(response)

      // All four at once, not just the first — a caller fixing one field at a
      // time per round-trip is a bad API, so the contract promises otherwise.
      expect(fields.map((f) => f.field).sort()).toEqual([
        'category',
        'dailyRateCents',
        'name',
        'sku',
      ])
    })

    test('should reject a malformed sku', async ({ itemsAsStaff, itemsValidator }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ sku: 'nope-1' }))

      const [error] = await itemsValidator.expectValidationError(response, 'sku')
      expect(error?.rule).toBe('pattern')
    })

    test('should reject a negative daily rate', async ({ itemsAsStaff, itemsValidator }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ dailyRateCents: -1 }))

      await itemsValidator.expectValidationError(response, 'dailyRateCents')
    })

    test('should reject an unknown category', async ({ itemsAsStaff, itemsValidator }) => {
      const response = await itemsAsStaff.createItem(
        buildItemPayload({ category: 'submarine' as never }),
      )

      await itemsValidator.expectValidationError(response, 'category')
    })

    test('should reject a name shorter than three characters', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ name: 'ab' }))

      await itemsValidator.expectValidationError(response, 'name')
    })
  })

  /**
   * Behaviour at the type boundary, which a contract states less often than it
   * states business rules — and which is where the defects are.
   *
   * These were written by probing the API rather than by reading the schema.
   * `minLength: 3` says nothing about which of absent, `null`, `''` and `'   '`
   * it refuses, and the answer turned out to be "three of the four".
   */
  test.describe('implicit contract', { tag: '@items' }, () => {
    /**
     * The boundary itself, not one side of it.
     *
     * A test for `ab` alone passes whether the limit is 3 or 30. Asserting
     * that 3 is accepted and 2 is not is what pins the boundary — an
     * off-by-one in either direction fails one of the pair.
     */
    test('should accept a name of exactly the minimum length', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ name: 'abc' }))

      await itemsValidator.expectItem(response, 201)
    })

    test('should accept a name of exactly the maximum length', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ name: 'a'.repeat(80) }))

      await itemsValidator.expectItem(response, 201)
    })

    test('should reject a name one character over the maximum', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ name: 'a'.repeat(81) }))

      await itemsValidator.expectValidationError(response, 'name')
    })

    /**
     * Absent, empty and whitespace-only are three different requests, and the
     * API treats them differently: the first two are refused, the third is not
     * — `minLength` counts characters and does not trim.
     *
     * That is a real behaviour rather than an oversight now, because the
     * contract says so. This test is what stops it drifting back into being
     * accidental.
     */
    test('should accept a whitespace-only name, as the contract states', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ name: '   ' }))

      const item = await itemsValidator.expectItem(response, 201)
      expect(item.name).toBe('   ')
    })

    test('should reject an empty name, unlike a whitespace-only one', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ name: '' }))

      await itemsValidator.expectValidationError(response, 'name')
    })

    /**
     * An enum member in the wrong case is a *present but invalid* value, which
     * exercises different code from an unknown token. A backend that lowercases
     * before comparing would accept this one and refuse `submarine`.
     */
    test('should reject a category that differs only in case', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(
        buildItemPayload({ category: 'TENT' as never }),
      )

      await itemsValidator.expectValidationError(response, 'category')
    })

    /**
     * Mass assignment: the client sends a field the server owns.
     *
     * The interesting failure is not an error — it is the request succeeding
     * and the value being honoured, so a caller can choose its own `id` or
     * backdate `createdAt`. Asserting the refusal names the field is what
     * distinguishes "rejected" from "silently ignored".
     */
    test('should reject a client-supplied id', async ({ itemsAsStaff, itemsValidator }) => {
      const response = await itemsAsStaff.createItem({
        ...buildItemPayload(),
        id: 'itm_chosen_by_the_client',
      } as never)

      await itemsValidator.expectValidationError(response, 'id')
    })

    test('should reject a client-supplied createdAt', async ({ itemsAsStaff, itemsValidator }) => {
      const response = await itemsAsStaff.createItem({
        ...buildItemPayload(),
        createdAt: '2000-01-01T00:00:00.000Z',
      } as never)

      await itemsValidator.expectValidationError(response, 'createdAt')
    })

    /**
     * A field of the wrong type, which is distinct from one out of range.
     *
     * Nothing else here sends a wrong type, so the whole type-checking branch
     * could be deleted with every test still green — verified by deleting it.
     * A string where an integer belongs is what a client sends when it forgets
     * to parse a form value, so it is worth a named refusal rather than a
     * coercion nobody decided on.
     */
    test('should reject a daily rate sent as a string', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(
        buildItemPayload({ dailyRateCents: '1500' as never }),
      )

      await itemsValidator.expectValidationError(response, 'dailyRateCents')
    })

    test('should reject a fractional daily rate, which is not an integer', async ({
      itemsAsStaff,
      itemsValidator,
    }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ dailyRateCents: 15.5 }))

      await itemsValidator.expectValidationError(response, 'dailyRateCents')
    })

    test('should reject a name sent as a number', async ({ itemsAsStaff, itemsValidator }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ name: 12345 as never }))

      await itemsValidator.expectValidationError(response, 'name')
    })

    /**
     * `minimum: 0` — zero is inside the range and negative is not. A free item
     * is a business decision the contract already allows; this pins it so
     * tightening to `minimum: 1` cannot happen unnoticed.
     */
    test('should accept a daily rate of zero', async ({ itemsAsStaff, itemsValidator }) => {
      const response = await itemsAsStaff.createItem(buildItemPayload({ dailyRateCents: 0 }))

      await itemsValidator.expectItem(response, 201)
    })
  })
})
