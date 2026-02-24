import { registerEmailProvider } from './registry.js'
import { smtpProvider } from './smtp.js'
import { sendgridProvider } from './sendgrid.js'
import { mailgunProvider } from './mailgun.js'
import { sesProvider } from './ses.js'
import { manualProvider } from './manual.js'

registerEmailProvider(smtpProvider)
registerEmailProvider(sendgridProvider)
registerEmailProvider(mailgunProvider)
registerEmailProvider(sesProvider)
registerEmailProvider(manualProvider)

export * from './types.js'
export * from './registry.js'

