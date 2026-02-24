import sgMail from '@sendgrid/mail'
import type { EmailProvider, EmailOptions } from './types.js'

export const sendgridProvider: EmailProvider = {
  id: 'sendgrid',
  label: 'SendGrid',
  fields: [
    { key: 'apiKey', label: 'SendGrid API Key', type: 'password', required: true }
  ],
  fromRequired: true,
  async send(options: EmailOptions, cfg: Record<string, unknown>, from?: string): Promise<boolean> {
    const apiKey = String(cfg.apiKey || '')
    if (!apiKey) {
      throw new Error('SendGrid API key not provided')
    }
    if (!from) {
      throw new Error('From address required for SendGrid')
    }

    sgMail.setApiKey(apiKey)

    await sgMail.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    })

    return true
  }
}

