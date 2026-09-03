import { buildItemPayload } from '@services/items/factory'
import { CommonError } from '@core/codes'
import { expect, test } from './fixtures'

test.describe('PATCH /items/{id}', { tag: ['@items', '@isolated'] }, () => {
  test('should update only the fields provided', async ({ itemsAsStaff, itemsValidator }) => {
    const created = await itemsValidator.expectItem(
      await itemsAsStaff.createItem(buildItemPayload({ name: 'autotest-original-name' })),
      201,
    )

    const updated = await itemsValidator.expectItem(
      await itemsAsStaff.updateItem(created.id, { dailyRateCents: 9900 }),
    )

    expect(updated.dailyRateCents).toBe(9900)
    expect(updated.name).toBe(created.name)
    expect(updated.sku).toBe(created.sku)
  })

  test('should advance updatedAt but not createdAt', async ({ itemsAsStaff, itemsValidator }) => {
    const created = await itemsValidator.expectItem(
      await itemsAsStaff.createItem(buildItemPayload()),
      201,
    )

    const updated = await itemsValidator.expectItem(
      await itemsAsStaff.updateItem(created.id, { conditionNote: 'scuffed pole' }),
    )

    expect(updated.createdAt).toBe(created.createdAt)
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt))
  })

  test('should reject an empty patch body', async ({ itemsAsStaff, itemsValidator }) => {
    const created = await itemsValidator.expectItem(
      await itemsAsStaff.createItem(buildItemPayload()),
      201,
    )

    const response = await itemsAsStaff.updateItem(created.id, {})

    await itemsValidator.expectValidationError(response, '_body')
  })

  test('should return 404 when updating an unknown item', async ({
    itemsAsStaff,
    itemsValidator,
  }) => {
    const response = await itemsAsStaff.updateItem('itm_does_not_exist', { name: 'autotest-x' })

    await itemsValidator.expectError(response, 404, CommonError.NOT_FOUND)
  })

  test('should forbid a member from updating', async ({
    itemsAsStaff,
    itemsAsMember,
    itemsValidator,
  }) => {
    const created = await itemsValidator.expectItem(
      await itemsAsStaff.createItem(buildItemPayload()),
      201,
    )

    const response = await itemsAsMember.updateItem(created.id, { dailyRateCents: 1 })

    await itemsValidator.expectError(response, 403, CommonError.FORBIDDEN)
  })
})

test.describe('DELETE /items/{id}', { tag: ['@items', '@isolated'] }, () => {
  test(
    'should retire an item and hide it from the default listing',
    { tag: '@smoke' },
    async ({ itemsAsStaff, itemsAsAdmin, itemsValidator }) => {
      const payload = buildItemPayload()
      const created = await itemsValidator.expectItem(await itemsAsStaff.createItem(payload), 201)

      const retired = await itemsValidator.expectRetired(await itemsAsAdmin.retireItem(created.id))
      expect(retired.id).toBe(created.id)

      // Soft delete: gone from the default list. Narrowed by sku so the claim
      // is about this item rather than about whatever fits on one page.
      const listed = await itemsValidator.expectItemPage(
        await itemsAsStaff.listItems({ sku: payload.sku }),
      )
      expect(listed.items).toHaveLength(0)

      // …but still retrievable, and now marked RETIRED.
      const fetched = await itemsValidator.expectItem(await itemsAsStaff.getItemById(created.id))
      expect(fetched.status).toBe('RETIRED')
    },
  )

  test('should surface retired items when asked for explicitly', async ({
    itemsAsStaff,
    itemsAsAdmin,
    itemsValidator,
  }) => {
    const payload = buildItemPayload()
    const created = await itemsValidator.expectItem(await itemsAsStaff.createItem(payload), 201)
    await itemsValidator.expectRetired(await itemsAsAdmin.retireItem(created.id))

    const page = await itemsValidator.expectItemPage(
      await itemsAsStaff.listItems({ status: 'RETIRED', sku: payload.sku }),
    )

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.id).toBe(created.id)
  })

  test('should forbid staff from retiring — admin only', async ({
    itemsAsStaff,
    itemsValidator,
  }) => {
    const created = await itemsValidator.expectItem(
      await itemsAsStaff.createItem(buildItemPayload()),
      201,
    )

    const response = await itemsAsStaff.retireItem(created.id)

    await itemsValidator.expectError(response, 403, CommonError.FORBIDDEN)
  })

  test('should return 404 when retiring an unknown item', async ({
    itemsAsAdmin,
    itemsValidator,
  }) => {
    const response = await itemsAsAdmin.retireItem('itm_does_not_exist')

    await itemsValidator.expectError(response, 404, CommonError.NOT_FOUND)
  })
})
