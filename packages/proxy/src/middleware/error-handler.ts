import type { Request, Response, NextFunction } from 'express'
import { mapToUserMessage } from '../utils/error-messages.js'

export interface ApiError extends Error {
  statusCode?: number
  code?: string
  detail?: string
}

export function errorHandler(
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = error.statusCode || 500
  const msg = mapToUserMessage(error.message) || error.message || 'Internal server error'

  if (status >= 500) {
    console.error(`${req.method} ${req.path} ->`, error)
  }

  res.status(status).json({ error: msg })
}

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` })
}
