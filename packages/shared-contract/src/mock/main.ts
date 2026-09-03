import { serve } from '@hono/node-server'
import { createApp } from './server'

const port = Number.parseInt(process.env.MOCK_PORT ?? '4010', 10)

serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`[mock] gear-rental API listening on http://127.0.0.1:${info.port}/api/v1`)
})
