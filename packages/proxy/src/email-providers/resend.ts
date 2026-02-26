import type { EmailProvider, EmailOptions } from './types.js'

export const resendProvider: EmailProvider = {
    id: 'resend',
    label: 'Resend',
    fields: [
        {
            key: 'apiKey',
            label: 'Resend API Key',
            type: 'password',
            required: true,
            placeholder: 're_xxxxxxxxx',
            help: 'Enter your Resend API key from the Resend dashboard.'
        }
    ],
    fromRequired: true,
    async send(options: EmailOptions, cfg: Record<string, unknown>, from?: string): Promise<boolean> {
        const apiKey = String(cfg.apiKey || '')
        if (!apiKey) throw new Error('Resend API key not provided')
        if (!from) throw new Error('From address required for Resend')

        const body: Record<string, string> = {
            from,
            to: options.to,
            subject: options.subject,
            html: options.html
        }
        if (options.text) {
            body.text = options.text
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        })

        if (!response.ok) {
            const errText = await response.text()
            throw new Error(`Resend API error (${response.status}): ${errText}`)
        }

        return true
    }
}