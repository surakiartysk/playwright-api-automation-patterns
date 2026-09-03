import { CommonError } from '@core/schemas'
import { HttpClient } from '@core/HttpClient'
import { ItemError, ItemsContext } from '@services/items/ItemsContext'
import { expiredToken, unknownSubjectToken } from '@support/tokens'
import { expect, test } from '@support/fixtures'

/**
 * The same coverage as the other package's three items spec files, in one.
 *
 * Fewer files is a side effect of the grouped context, not a goal: with one
 * name to import instead of three, splitting by endpoint buys less than it
 * costs. Whether that is an improvement or a loss of navigability is one of the
 * things docs/comparison.md weighs.
 */
test.describe('items', { tag: ['@items', '@isolated'] }, () => {
  test.describe('create', () => {
    test(
      'should create an item and default its status to AVAILABLE',
      { tag: '@smoke' },
      async ({ itemsAsStaff }) => {
        const payload = itemsAsStaff.buildPayload({ category: 'climbing', dailyRateCents: 2400 })

        const item = await itemsAsStaff.expectItem(await itemsAsStaff.create(payload), 201)

        expect(item).toMatchObject({
          sku: payload.sku,
          name: payload.name,
          category: 'climbing',
          dailyRateCents: 2400,
          status: 'AVAILABLE',
        })
      },
    )

    test('should default conditionNote to an empty string', async ({ itemsAsStaff }) => {
      const item = await itemsAsStaff.provision()

      expect(item.conditionNote).toBe('')
    })

    test('should reject a duplicate sku', async ({ itemsAsStaff }) => {
      const first = await itemsAsStaff.provision()

      const duplicate = await itemsAsStaff.create(itemsAsStaff.buildPayload({ sku: first.sku }))

      await itemsAsStaff.expectError(duplicate, 409, ItemError.SKU_TAKEN)
    })

    test('should forbid a member from creating an item', async ({ itemsAsMember }) => {
      const response = await itemsAsMember.create(itemsAsMember.buildPayload())

      await itemsAsMember.expectError(response, 403, CommonError.FORBIDDEN)
    })

    test('should name every missing required field', async ({ itemsAsStaff }) => {
      const fields = await itemsAsStaff.expectValidationError(
        await itemsAsStaff.create({} as never),
      )

      expect(fields.map((f) => f.field).sort()).toEqual([
        'category',
        'dailyRateCents',
        'name',
        'sku',
      ])
    })

    test('should reject a malformed sku', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(itemsAsStaff.buildPayload({ sku: 'nope-1' }))

      const [error] = await itemsAsStaff.expectValidationError(response, 'sku')
      expect(error?.rule).toBe('pattern')
    })

    test('should reject a negative daily rate', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(itemsAsStaff.buildPayload({ dailyRateCents: -1 }))

      await itemsAsStaff.expectValidationError(response, 'dailyRateCents')
    })

    test('should reject an unknown category', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(
        itemsAsStaff.buildPayload({ category: 'submarine' as never }),
      )

      await itemsAsStaff.expectValidationError(response, 'category')
    })

    test('should reject a name shorter than three characters', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(itemsAsStaff.buildPayload({ name: 'ab' }))

      await itemsAsStaff.expectValidationError(response, 'name')
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
  test.describe('implicit contract', () => {
    /**
     * The boundary itself, not one side of it.
     *
     * A test for `ab` alone passes whether the limit is 3 or 30. Asserting
     * that 3 is accepted and 2 is not is what pins the boundary — an
     * off-by-one in either direction fails one of the pair.
     */
    test('should accept a name of exactly the minimum length', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(itemsAsStaff.buildPayload({ name: 'abc' }))

      await itemsAsStaff.expectItem(response, 201)
    })

    test('should accept a name of exactly the maximum length', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(
        itemsAsStaff.buildPayload({ name: 'a'.repeat(80) }),
      )

      await itemsAsStaff.expectItem(response, 201)
    })

    test('should reject a name one character over the maximum', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(
        itemsAsStaff.buildPayload({ name: 'a'.repeat(81) }),
      )

      await itemsAsStaff.expectValidationError(response, 'name')
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
    }) => {
      const response = await itemsAsStaff.create(itemsAsStaff.buildPayload({ name: '   ' }))

      const item = await itemsAsStaff.expectItem(response, 201)
      expect(item.name).toBe('   ')
    })

    test('should reject an empty name, unlike a whitespace-only one', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(itemsAsStaff.buildPayload({ name: '' }))

      await itemsAsStaff.expectValidationError(response, 'name')
    })

    /**
     * An enum member in the wrong case is a *present but invalid* value, which
     * exercises different code from an unknown token. A backend that lowercases
     * before comparing would accept this one and refuse `submarine`.
     */
    test('should reject a category that differs only in case', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(
        itemsAsStaff.buildPayload({ category: 'TENT' as never }),
      )

      await itemsAsStaff.expectValidationError(response, 'category')
    })

    /**
     * Mass assignment: the client sends a field the server owns.
     *
     * The interesting failure is not an error — it is the request succeeding
     * and the value being honoured, so a caller can choose its own `id` or
     * backdate `createdAt`. Asserting the refusal names the field is what
     * distinguishes "rejected" from "silently ignored".
     */
    test('should reject a client-supplied id', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create({
        ...itemsAsStaff.buildPayload(),
        id: 'itm_chosen_by_the_client',
      } as never)

      await itemsAsStaff.expectValidationError(response, 'id')
    })

    test('should reject a client-supplied createdAt', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create({
        ...itemsAsStaff.buildPayload(),
        createdAt: '2000-01-01T00:00:00.000Z',
      } as never)

      await itemsAsStaff.expectValidationError(response, 'createdAt')
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
    test('should reject a daily rate sent as a string', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(
        itemsAsStaff.buildPayload({ dailyRateCents: '1500' as never }),
      )

      await itemsAsStaff.expectValidationError(response, 'dailyRateCents')
    })

    test('should reject a fractional daily rate, which is not an integer', async ({
      itemsAsStaff,
    }) => {
      const response = await itemsAsStaff.create(
        itemsAsStaff.buildPayload({ dailyRateCents: 15.5 }),
      )

      await itemsAsStaff.expectValidationError(response, 'dailyRateCents')
    })

    test('should reject a name sent as a number', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(
        itemsAsStaff.buildPayload({ name: 12345 as never }),
      )

      await itemsAsStaff.expectValidationError(response, 'name')
    })

    /**
     * `minimum: 0` — zero is inside the range and negative is not. A free item
     * is a business decision the contract already allows; this pins it so
     * tightening to `minimum: 1` cannot happen unnoticed.
     */
    test('should accept a daily rate of zero', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.create(itemsAsStaff.buildPayload({ dailyRateCents: 0 }))

      await itemsAsStaff.expectItem(response, 201)
    })
  })

  test.describe('read', () => {
    test('should return a created item by id', { tag: '@smoke' }, async ({ itemsAsStaff }) => {
      const created = await itemsAsStaff.provision()

      const fetched = await itemsAsStaff.expectItem(await itemsAsStaff.getById(created.id))

      expect(fetched).toEqual(created)
    })

    test('should return 404 for an unknown id', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.getById('itm_does_not_exist')

      await itemsAsStaff.expectError(response, 404, CommonError.NOT_FOUND)
    })

    test('should reject a request with no token', async ({ anonymousItems }) => {
      await anonymousItems.expectError(await anonymousItems.list(), 401, CommonError.UNAUTHORIZED)
    })

    test('should reject a malformed token', async ({ apiConfig, api }) => {
      // Built here rather than as a fixture: `withToken` exists precisely so a
      // test can vary the caller without a fixture per credential.
      const garbage = new ItemsContext(new HttpClient(apiConfig, api, 'not-a-real-token'))

      await garbage.expectError(await garbage.list(), 401, CommonError.UNAUTHORIZED)
    })

    test('should reject an expired token', async ({ apiConfig, api }) => {
      // Without this case the expiry check can be deleted with nothing failing
      // — verified by disabling it in the mock.
      const expired = new ItemsContext(new HttpClient(apiConfig, api, expiredToken()))

      await expired.expectError(await expired.list(), 401, CommonError.UNAUTHORIZED)
    })

    test('should reject a valid token for an account that does not exist', async ({
      apiConfig,
      api,
    }) => {
      // The other three fail on shape — absent, unparseable, expired — so none
      // of them reaches the check that the subject is a real account. That
      // check could be deleted with every test still green; verified.
      const stranger = new ItemsContext(new HttpClient(apiConfig, api, unknownSubjectToken()))

      await stranger.expectError(await stranger.list(), 401, CommonError.UNAUTHORIZED)
    })

    test('should list an item that was just created', async ({ itemsAsStaff }) => {
      const created = await itemsAsStaff.provision()

      // Narrowed by the API rather than by fetching a wide page and filtering
      // locally: the latter assumes the row lands on that page, which stops
      // being true once enough workers are creating data.
      const page = await itemsAsStaff.expectPage(await itemsAsStaff.list({ sku: created.sku }))

      expect(page.items).toHaveLength(1)
      expect(page.items[0]?.id).toBe(created.id)
    })

    test('should filter by category', async ({ itemsAsStaff }) => {
      // A match and a non-match, both seeded here: asserting only that
      // everything returned is cooking would pass against a deleted filter
      // whenever the store holds nothing else.
      const wanted = await itemsAsStaff.provision({ category: 'cooking' })
      const unwanted = await itemsAsStaff.provision({ category: 'climbing' })

      // Combining filters keeps each result to one known row.
      const match = await itemsAsStaff.expectPage(
        await itemsAsStaff.list({ category: 'cooking', sku: wanted.sku }),
      )
      const excluded = await itemsAsStaff.expectPage(
        await itemsAsStaff.list({ category: 'cooking', sku: unwanted.sku }),
      )

      expect(match.items).toHaveLength(1)
      expect(match.items[0]?.category).toBe('cooking')
      expect(excluded.items).toHaveLength(0)
    })

    test('should return nothing for an unknown sku', async ({ itemsAsStaff }) => {
      // The empty case matters: a filter that silently ignored `sku` would
      // still satisfy every test above, which only ask for skus that exist.
      const page = await itemsAsStaff.expectPage(await itemsAsStaff.list({ sku: 'ZZZ-9999' }))

      expect(page.items).toHaveLength(0)
      expect(page.pagination.total).toBe(0)
    })

    test('should respect pageSize', async ({ itemsAsStaff }) => {
      await itemsAsStaff.provision()
      await itemsAsStaff.provision()

      const page = await itemsAsStaff.expectPage(await itemsAsStaff.list({ pageSize: 1 }))

      expect(page.items).toHaveLength(1)
      expect(page.pagination).toMatchObject({ page: 1, pageSize: 1 })
      expect(page.pagination.totalPages).toBe(page.pagination.total)
    })
  })

  test.describe('update', () => {
    test('should update only the fields provided', async ({ itemsAsStaff }) => {
      const created = await itemsAsStaff.provision()

      const updated = await itemsAsStaff.expectItem(
        await itemsAsStaff.update(created.id, { dailyRateCents: 9900 }),
      )

      expect(updated.dailyRateCents).toBe(9900)
      expect(updated.name).toBe(created.name)
      expect(updated.sku).toBe(created.sku)
    })

    test('should advance updatedAt but not createdAt', async ({ itemsAsStaff }) => {
      const created = await itemsAsStaff.provision()

      const updated = await itemsAsStaff.expectItem(
        await itemsAsStaff.update(created.id, { conditionNote: 'scuffed pole' }),
      )

      expect(updated.createdAt).toBe(created.createdAt)
      expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt))
    })

    test('should reject an empty patch body', async ({ itemsAsStaff }) => {
      const created = await itemsAsStaff.provision()

      await itemsAsStaff.expectValidationError(await itemsAsStaff.update(created.id, {}), '_body')
    })

    test('should return 404 when updating an unknown item', async ({ itemsAsStaff }) => {
      const response = await itemsAsStaff.update('itm_does_not_exist', { name: 'autotest-x' })

      await itemsAsStaff.expectError(response, 404, CommonError.NOT_FOUND)
    })

    test('should forbid a member from updating', async ({ itemsAsStaff, itemsAsMember }) => {
      const created = await itemsAsStaff.provision()

      const response = await itemsAsMember.update(created.id, { dailyRateCents: 1 })

      await itemsAsMember.expectError(response, 403, CommonError.FORBIDDEN)
    })
  })

  test.describe('retire', () => {
    test(
      'should retire an item and hide it from the default listing',
      { tag: '@smoke' },
      async ({ itemsAsStaff, itemsAsAdmin }) => {
        const created = await itemsAsStaff.provision()

        const retired = await itemsAsAdmin.expectRetired(await itemsAsAdmin.retire(created.id))
        expect(retired.id).toBe(created.id)

        const listed = await itemsAsStaff.expectPage(await itemsAsStaff.list({ sku: created.sku }))
        expect(listed.items).toHaveLength(0)

        const fetched = await itemsAsStaff.expectItem(await itemsAsStaff.getById(created.id))
        expect(fetched.status).toBe('RETIRED')
      },
    )

    test('should surface retired items when asked explicitly', async ({
      itemsAsStaff,
      itemsAsAdmin,
    }) => {
      const created = await itemsAsStaff.provision()
      await itemsAsAdmin.expectRetired(await itemsAsAdmin.retire(created.id))

      const page = await itemsAsStaff.expectPage(
        await itemsAsStaff.list({ status: 'RETIRED', sku: created.sku }),
      )

      expect(page.items).toHaveLength(1)
      expect(page.items[0]?.id).toBe(created.id)
    })

    test('should forbid staff from retiring — admin only', async ({ itemsAsStaff }) => {
      const created = await itemsAsStaff.provision()

      await itemsAsStaff.expectError(
        await itemsAsStaff.retire(created.id),
        403,
        CommonError.FORBIDDEN,
      )
    })

    test('should return 404 when retiring an unknown item', async ({ itemsAsAdmin }) => {
      await itemsAsAdmin.expectError(
        await itemsAsAdmin.retire('itm_does_not_exist'),
        404,
        CommonError.NOT_FOUND,
      )
    })
  })
})
