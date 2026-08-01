export type ChangeRateDirection = 'up' | 'down' | 'flat'

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatPrice(value: number | null | undefined): string | null {
  if (!isFiniteNumber(value)) return null

  const absoluteValue = Math.abs(value)
  const maximumFractionDigits = absoluteValue >= 100
    ? 0
    : absoluteValue >= 1
      ? 2
      : absoluteValue >= 0.01
        ? 4
        : 8

  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits,
    useGrouping: true,
  }).format(value)}원`
}

export function formatChangeRate(value: number | null | undefined): string | null {
  if (!isFiniteNumber(value)) return null
  if (Object.is(value, -0) || value === 0) return '0.00%'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function getChangeRateDirection(value: number): ChangeRateDirection {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

export function formatChartDate(value: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[1]}-${match[2]}` : value
}
