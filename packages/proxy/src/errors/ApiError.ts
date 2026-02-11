export class ApiError extends Error {
  code: string
  statusCode: number
  detail?: string

  constructor(code: string, message: string, statusCode = 500, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
    this.detail = detail
  }
}
