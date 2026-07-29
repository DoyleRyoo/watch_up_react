const SERVICE_ERROR_MESSAGE = '서비스 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function createContractError(status = 0): ApiError {
  return new ApiError(status, 'INTERNAL_SERVER_ERROR', SERVICE_ERROR_MESSAGE)
}

export function createAuthRequiredError(): ApiError {
  return new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.')
}
