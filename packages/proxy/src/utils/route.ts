import type { Request, Response, NextFunction } from 'express'

// Catches async errors so we don't need try/catch in every handler.
// Known errors (with statusCode) get sent as-is; unknown ones become 500s.
export function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}
