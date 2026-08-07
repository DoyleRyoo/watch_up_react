import { describe, expect, it } from 'vitest'
import {
  formatChangeRate,
  formatChartDate,
  formatPrice,
  getChangeRateDirection,
} from '../features/watchup/formatters'

describe('WatchUp 표시 포맷터', () => {
  it.each([
    [142_300_000, '142,300,000원'],
    [1_000, '1,000원'],
    [999.9, '1,000원'],
    [100, '100원'],
    [12.34, '12.34원'],
    [1, '1원'],
    [0.1234, '0.1234원'],
    [0.01, '0.01원'],
    [0.00001234, '0.00001234원'],
  ])('%d 가격을 과학적 표기 없이 %s로 표시한다', (value, expected) => {
    expect(formatPrice(value)).toBe(expected)
  })

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])('유효하지 않은 %s 가격을 0원으로 만들지 않는다', (value) => {
    expect(formatPrice(value)).toBeNull()
  })

  it.each([
    [1.25, '+1.25%', 'up'],
    [-0.42, '-0.42%', 'down'],
    [0, '0.00%', 'flat'],
    [-0, '0.00%', 'flat'],
  ] as const)('이미 백분율인 %d를 재계산하지 않는다', (value, expected, direction) => {
    expect(formatChangeRate(value)).toBe(expected)
    expect(getChangeRateDirection(value)).toBe(direction)
  })

  it('날짜를 시간대 변환 없이 MM-DD로 표시하고 잘못된 형식은 보존한다', () => {
    expect(formatChartDate('2026-06-16')).toBe('06-16')
    expect(formatChartDate('2026/06/16')).toBe('2026/06/16')
  })
})
