import type { EmailProvider, EmailOptions } from './types.js'

export const mailgunProvider: EmailProvider = {
  id: 'mailgun',
  label: 'Mailgun',
  fields: [
    { key: 'apiKey', label: 'Mailgun API Key', type: 'password', required: true },
    { key: 'domain', label: 'Sending Domain', type: 'text', required: true },
    {
      key: 'apiUrl',
      label: 'API URL',
      type: 'url',
      help: 'Leave empty for US region. Use https://api.eu.mailgun.net for EU region.'
    }
  ],
  fromRequired: true,
  async send(options: EmailOptions, cfg: Record<string, unknown>, from?: string): Promise<boolean> {
    const apiKey = String(cfg.apiKey || '')
    const domain = String(cfg.domain || '')
    const apiUrl = String(cfg.apiUrl || '') || 'https://api.mailgun.net'

    if (!apiKey || !domain) {
      throw new Error('Mailgun configuration incomplete')
    }
    if (!from) {
      throw new Error('From address required for Mailgun')
    }

    const url = `${apiUrl.replace(/\/$/, '')}/v3/${domain}/messages`

    const formData = new URLSearchParams()
    formData.append('from', from)
    formData.append('to', options.to)
    formData.append('subject', options.subject)
    formData.append('html', options.html)
    if (options.text) {
      formData.append('text', options.text)
    }

    const auth = Buffer.from(`api:${apiKey}`).toString('base64')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Mailgun API error (${response.status}): ${errText}`)
    }

    return true
  }
}

