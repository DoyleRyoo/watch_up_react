export type ApiSuccess<TData, TMeta = null> = {
  data: TData
  meta: TMeta
}

export type ApiListMeta = {
  count: number
}

export type ApiErrorEnvelope = {
  error: {
    code: string
    message: string
    details: unknown
  }
}
