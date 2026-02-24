import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import type { EmailProvider, EmailOptions } from './types.js'

export const sesProvider: EmailProvider = {
  id: 'ses',
  label: 'AWS SES',
  fields: [
    { key: 'accessKeyId', label: 'Access Key ID', type: 'text', required: true },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true },
    {
      key: 'region',
      label: 'Region',
      type: 'text',
      required: true,
      help: 'The From address must be verified in AWS SES and match this region.'
    }
  ],
  fromRequired: true,
  async send(options: EmailOptions, cfg: Record<string, unknown>, from?: string): Promise<boolean> {
    const accessKeyId = String(cfg.accessKeyId || '')
    const secretAccessKey = String(cfg.secretAccessKey || '')
    const region = String(cfg.region || '')

    if (!accessKeyId.trim() || !secretAccessKey.trim() || !region.trim()) {
      throw new Error('AWS SES requires accessKeyId, secretAccessKey, and region')
    }
    if (!from?.trim()) {
      throw new Error('From address required for AWS SES (must be verified in SES)')
    }

    const client = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })

    const command = new SendEmailCommand({
      Source: from,
      Destination: {
        ToAddresses: [options.to]
      },
      Message: {
        Subject: {
          Data: options.subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: options.html,
            Charset: 'UTF-8'
          },
          ...(options.text && {
            Text: {
              Data: options.text,
              Charset: 'UTF-8'
            }
          })
        }
      }
    })

    await client.send(command)
    return true
  }
}

