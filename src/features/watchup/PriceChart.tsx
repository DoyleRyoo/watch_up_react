import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatChartDate, formatPrice } from './formatters'
import type { CoinChart } from './types'

export function PriceChart({ chart }: { chart: CoinChart }) {
  const count = chart.candles.length
  if (count === 0) {
    return <p className="chart-empty">데이터 없음</p>
  }

  const chartMode = count === 1 ? 'point' : 'line'
  return (
    <div className="chart-block">
      <div
        className="price-chart-canvas"
        role="img"
        aria-label={`${chart.marketCode} 최근 30일 종가 차트, 데이터 ${count}개`}
        data-chart-mode={chartMode}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 720, height: 320 }}>
          <LineChart data={chart.candles} accessibilityLayer margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatChartDate} minTickGap={24} />
            <YAxis
              dataKey="closingPrice"
              domain={['auto', 'auto']}
              tickFormatter={(value: number) => formatPrice(value)?.replace(/원$/, '') ?? ''}
              width={88}
            />
            <Tooltip
              labelFormatter={(label) => String(label)}
              formatter={(value) => [formatPrice(Number(value)) ?? '', '종가']}
            />
            <Line
              type="linear"
              dataKey="closingPrice"
              name="종가"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={count === 1 ? { r: 5, strokeWidth: 2 } : false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {count < 30 && <p className="chart-note">상장 이후 제공 가능한 가격 데이터만 표시합니다.</p>}
    </div>
  )
}
