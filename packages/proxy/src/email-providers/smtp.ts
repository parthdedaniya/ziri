import nodemailer from 'nodemailer'
import type { EmailProvider, EmailOptions } from './types.js'

export const smtpProvider: EmailProvider = {
  id: 'smtp',
  label: 'SMTP',
  fields: [
    { key: 'host', label: 'SMTP Host', type: 'text', required: true },
    { key: 'port', label: 'SMTP Port', type: 'number', required: true },
    {
      key: 'secure',
      label: 'Use TLS/SSL',
      type: 'checkbox',
      help: 'Port 587 uses STARTTLS (leave unchecked). Port 465 uses SSL/TLS (check this box).'
    },
    { key: 'user', label: 'SMTP Username', type: 'text', required: true },
    { key: 'pass', label: 'SMTP Password', type: 'password', required: true }
  ],
  async send(options: EmailOptions, cfg: Record<string, unknown>, from?: string): Promise<boolean> {
    const host = String(cfg.host || '')
    const port = Number(cfg.port || 0)
    const secureFlag = Boolean(cfg.secure)
    const user = String(cfg.user || '')
    const pass = String(cfg.pass || '')

    if (!host || !port || !user || !pass) {
      throw new Error('SMTP configuration incomplete')
    }

    let secure = secureFlag
    let requireTLS = false

    if (port === 465) {
      secure = true
      requireTLS = false
    } else if (port === 587) {
      secure = false
      requireTLS = true
    } else {
      secure = secureFlag
      requireTLS = secureFlag
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS,
      auth: {
        user,
        pass
      }
    })

    await transporter.sendMail({
      from: from || user,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    })

    return true
  }
}

