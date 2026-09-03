import { buildItemPayload } from '@services/items/factory'
import { ItemsClient } from '@services/items/ItemsClient'
import { CommonError } from '@core/codes'
import { expiredToken, unknownSubjectToken } from '@utils/tokens'
import { expect, test } from './fixtures'

test.describe('GET /items', { tag: ['@items', '@isolated'] }, () => {
  test(
    'should return a created item by id',
    { tag: '@smoke' },
    async ({ itemsAsStaff, itemsValidator }) => {
      const created = await itemsValidator.expectItem(
        await itemsAsStaff.createItem(buildItemPayload()),
        201,
      )

      const fetched = await itemsValidator.expectItem(await itemsAsStaff.getItemById(created.id))

      expect(fetched).toEqual(created)
    },
  )

  test('should return 404 for an unknown id', async ({ itemsAsStaff, itemsValidator }) => {
    const response = await itemsAsStaff.getItemById('itm_does_not_exist')

    await itemsValidator.expectError(response, 404, CommonError.NOT_FOUND)
  })

  test.describe('authentication', () => {
    // These build their own clients rather than use a role fixture: each needs a
    // token the fixtures deliberately never hand out.
    test('should reject a request with no token', async ({ apiConfig, api, itemsValidator }) => {
      const anonymous = new ItemsClient(apiConfig, api)

      await itemsValidator.expectError(await anonymous.listItems(), 401, CommonError.UNAUTHORIZED)
    })

    test('should reject a malformed token', async ({ apiConfig, api, itemsValidator }) => {
      const garbage = new ItemsClient(apiConfig, api, 'not-a-real-token')

      await itemsValidator.expectError(await garbage.listItems(), 401, CommonError.UNAUTHORIZED)
    })

    test('should reject an expired token', async ({ apiConfig, api, itemsValidator }) => {
      // Minted here rather than waiting an hour for a real one to age out.
      // Without this case the expiry check can be deleted outright and every
      // other test still passes — verified by disabling it in the mock.
      const expired = new ItemsClient(apiConfig, api, expiredToken())

      await itemsValidator.expectError(await expired.listItems(), 401, CommonError.UNAUTHORIZED)
    })

    test('should reject a valid token for an account that does not exist', async ({
      apiConfig,
      api,
      itemsValidator,
    }) => {
      // The other three fail on shape — absent, unparseable, expired — so none
      // of them reaches the check that the subject is a real account. That
      // check could be deleted with every test still green; verified.
      const stranger = new ItemsClient(apiConfig, api, unknownSubjectToken())

      await itemsValidator.expectError(await stranger.listItems(), 401, CommonError.UNAUTHORIZED)
    })
  })

  /**
   * Listing assertions are written against data this test owns, and they let
   * the API do the narrowing.
   *
   * Every worker shares one backend, so a claim about totals or about a whole
   * page is really a claim about what every other test happened to create.
   * Fetching a wide page and filtering locally looks like it solves that, but
   * it only moves the assumption: it assumes the row is *on* that page. Under
   * eight workers it stops being, and the test fails for a reason that has
   * nothing to do with the behaviour it covers.
   */
  test('should list an item that was just created', async ({ itemsAsStaff, itemsValidator }) => {
    const payload = buildItemPayload()
    const created = await itemsValidator.expectItem(await itemsAsStaff.createItem(payload), 201)

    const page = await itemsValidator.expectItemPage(
      await itemsAsStaff.listItems({ sku: payload.sku }),
    )

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.id).toBe(created.id)
  })

  test('should filter by category', async ({ itemsAsStaff, itemsValidator }) => {
    // Both halves of the check are seeded here: a match that must come back and
    // a non-match that must not. Asserting only "everything returned is cooking"
    // would pass against a broken filter whenever the store happens to hold
    // nothing else — which is exactly the case when this spec runs alone.
    const wanted = buildItemPayload({ category: 'cooking' })
    const unwanted = buildItemPayload({ category: 'climbing' })
    await itemsValidator.expectItem(await itemsAsStaff.createItem(wanted), 201)
    await itemsValidator.expectItem(await itemsAsStaff.createItem(unwanted), 201)

    // Combining filters keeps the result to this test's own rows, so the
    // assertion holds no matter how much other data exists.
    const match = await itemsValidator.expectItemPage(
      await itemsAsStaff.listItems({ category: 'cooking', sku: wanted.sku }),
    )
    const excluded = await itemsValidator.expectItemPage(
      await itemsAsStaff.listItems({ category: 'cooking', sku: unwanted.sku }),
    )

    expect(match.items).toHaveLength(1)
    expect(match.items[0]?.category).toBe('cooking')
    // The climbing item exists, but must not survive a cooking filter.
    expect(excluded.items).toHaveLength(0)
  })

  test('should return nothing for an unknown sku', async ({ itemsAsStaff, itemsValidator }) => {
    // The empty case matters: without it, a filter that silently ignored `sku`
    // would still satisfy every test above, since they only ever ask for a sku
    // that exists.
    const page = await itemsValidator.expectItemPage(
      await itemsAsStaff.listItems({ sku: 'ZZZ-9999' }),
    )

    expect(page.items).toHaveLength(0)
    expect(page.pagination.total).toBe(0)
  })

  test('should respect pageSize', async ({ itemsAsStaff, itemsValidator }) => {
    // Two items of our own guarantee at least two pages exist at pageSize 1,
    // whatever else is in the store.
    await itemsAsStaff.createItem(buildItemPayload())
    await itemsAsStaff.createItem(buildItemPayload())

    const page = await itemsValidator.expectItemPage(await itemsAsStaff.listItems({ pageSize: 1 }))

    expect(page.items).toHaveLength(1)
    expect(page.pagination).toMatchObject({ page: 1, pageSize: 1 })
    // Derived from `total`, so it stays true regardless of the shared count.
    expect(page.pagination.totalPages).toBe(page.pagination.total)
  })
})
