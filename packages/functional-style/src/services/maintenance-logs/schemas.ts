import { z } from 'zod'
import { MAINTENANCE_STATES } from '@gear-rental/shared-contract'
import { isoDateTime, paginationSchema } from '@core/schemas'

export const maintenanceLogSchema = z
  .object({
    id: z.string().min(1),
    reservationId: z.string().min(1),
    itemId: z.string().min(1),
    state: z.enum(MAINTENANCE_STATES),
    openedAt: isoDateTime,
    resolvedAt: isoDateTime.nullable(),
    resolutionNote: z.string().nullable(),
  })
  .strict()

export const maintenanceLogPageSchema = z
  .object({
    logs: z.array(maintenanceLogSchema),
    pagination: paginationSchema,
  })
  .strict()
