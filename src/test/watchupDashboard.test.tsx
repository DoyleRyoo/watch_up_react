import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { DetailArea } from '../features/watchup/DetailArea'
import { PriceChart } from '../features/watchup/PriceChart'
import { WatchlistArea } from '../features/watchup/WatchlistArea'
import type {
  CoinChartResponse,
  WatchlistItem,
  WatchlistResponse,
} from '../features/watchup/types'
import { HomePage } from '../pages/HomePage'
import { useWatchupStore } from '../stores/watchupStore'

const featureApi = vi.hoisted(() => ({
  searchCoins: vi.fn(),
  registerWatchlist: vi.fn(),
  getWatchlist: vi.fn(),
  getCoinChart: vi.fn(),
}))
vi.mock('../features/watchup/api', () => featureApi)

function item(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: 1,
    marketCode: 'KRW-BTC',
    koreanName: '비트코인',
    englishName: 'Bitcoin',
    symbol: 'BTC',
    currentPrice: 142_300_000,
    signedChangeRate: 1.25,
    status: 'ACTIVE',
    isStale: false,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function watchlistResponse(data: WatchlistItem[]): WatchlistResponse {
  return { data, meta: { count: data.length } }
}

function chartResponse(marketCode: string, count = 2): CoinChartResponse {
  return {
    data: {
      marketCode,
      period: '30d',
      candles: Array.from({ length: count }, (_, index) => ({
        date: `2026-06-${String(index + 1).padStart(2, '0')}`,
        closingPrice: 100 + index,
      })),
    },
    meta: { count },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  featureApi.searchCoins.mockReset().mockResolvedValue({ data: [], meta: { count: 0 } })
  featureApi.registerWatchlist.mockReset()
  featureApi.getWatchlist.mockReset().mockResolvedValue(watchlistResponse([]))
  featureApi.getCoinChart.mockReset().mockImplementation((marketCode: string) => Promise.resolve(chartResponse(marketCode)))
  useWatchupStore.getState().reset()
})

afterEach(() => {
  useWatchupStore.getState().reset()
})

describe('최초 관심목록과 선택', () => {
  it('Strict Mode에서도 최초 GET을 한 번만 보내고 서버 순서의 첫 항목을 선택한다', async () => {
    const first = item({ id: 7, marketCode: 'KRW-XRP', koreanName: '리플', symbol: 'SERVER-XRP', status: 'CAUTION', isStale: true })
    const second = item({ id: 2 })
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([first, second]))

    render(<MemoryRouter><StrictMode><HomePage /></StrictMode></MemoryRouter>)

    const firstButton = await screen.findByRole('button', { name: '리플 선택' })
    const buttons = screen.getAllByRole('button', { name: / 선택$/ })
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['리플 선택', '비트코인 선택'])
    expect(firstButton).toHaveAttribute('aria-current', 'true')
    expect(screen.getAllByText(/SERVER-XRP/).length).toBeGreaterThan(0)
    expect(useWatchupStore.getState().selectedCoin).toBe(first)
    expect(useWatchupStore.getState().selectedCoin?.isStale).toBe(true)
    expect(featureApi.getWatchlist).toHaveBeenCalledOnce()
    await waitFor(() => expect(featureApi.getCoinChart).toHaveBeenCalledOnce())
    expect(featureApi.getCoinChart.mock.calls[0][0]).toBe('KRW-XRP')

    fireEvent.click(firstButton)
    expect(featureApi.getCoinChart).toHaveBeenCalledOnce()
  })

  it('목록 갱신은 선택을 최신 객체로 연결하고 빈 목록은 선택·차트를 비운다', async () => {
    const oldSelection = item({ currentPrice: 90, isStale: true })
    const refreshedSelection = item({ currentPrice: 100, isStale: false })
    useWatchupStore.setState({
      watchlist: [oldSelection],
      selectedCoin: oldSelection,
      chartData: chartResponse('KRW-BTC').data,
      chartMeta: { count: 2 },
    })
    featureApi.getWatchlist
      .mockResolvedValueOnce(watchlistResponse([refreshedSelection]))
      .mockResolvedValueOnce(watchlistResponse([]))

    await useWatchupStore.getState().loadInitialWatchlist()
    expect(useWatchupStore.getState().selectedCoin).toBe(refreshedSelection)
    expect(useWatchupStore.getState().selectedCoin?.currentPrice).toBe(100)

    await useWatchupStore.getState().loadInitialWatchlist()
    expect(useWatchupStore.getState()).toMatchObject({
      watchlist: [],
      selectedCoin: null,
      chartData: null,
      chartMeta: null,
    })
  })

  it('목록 실패는 기존 목록·선택을 지우지 않고 서버 오류 code를 보존한다', async () => {
    const existing = item()
    useWatchupStore.setState({ watchlist: [existing], selectedCoin: existing })
    featureApi.getWatchlist.mockRejectedValue(new ApiError(503, 'REDIS_UNAVAILABLE', 'internal'))

    await useWatchupStore.getState().loadInitialWatchlist()

    expect(useWatchupStore.getState().watchlist).toEqual([existing])
    expect(useWatchupStore.getState().selectedCoin).toBe(existing)
    expect(useWatchupStore.getState().watchlistError?.code).toBe('REDIS_UNAVAILABLE')
  })
})

describe('관심목록·상세 상태 표시', () => {
  it('네 상태를 항목별로 표시하고 서버 symbol, 부호, 원본 퍼센트를 사용한다', () => {
    const active = item({ symbol: 'SERVER-BTC' })
    const caution = item({ id: 2, marketCode: 'KRW-XRP', koreanName: '리플', symbol: 'XRP', status: 'CAUTION', signedChangeRate: -0.42 })
    const unavailable = item({ id: 3, marketCode: 'KRW-OLD', koreanName: '이전코인', symbol: 'OLD', status: 'UNAVAILABLE', currentPrice: null, signedChangeRate: null })
    const priceError = item({ id: 4, marketCode: 'KRW-ERR', koreanName: '오류코인', symbol: 'ERR', status: 'PRICE_ERROR', currentPrice: null, signedChangeRate: null })
    useWatchupStore.setState({ watchlist: [active, caution, unavailable, priceError], selectedCoin: active })

    render(<WatchlistArea />)

    expect(screen.getByText(/SERVER-BTC/)).toBeInTheDocument()
    expect(screen.getByText('+1.25%')).toHaveClass('change-up')
    expect(screen.getByText('-0.42%')).toHaveClass('change-down')
    expect(screen.getByText('투자 유의')).toBeInTheDocument()
    expect(screen.getByText('거래지원 종료 또는 조회 불가')).toBeInTheDocument()
    expect(screen.getByText('현재가 조회 실패')).toBeInTheDocument()
    expect(screen.queryByText('0원')).not.toBeInTheDocument()
  })

  it('UNAVAILABLE과 PRICE_ERROR 상세은 차트를 요청하지 않고 이전 차트를 제거한다', async () => {
    const unavailable = item({ status: 'UNAVAILABLE', currentPrice: null, signedChangeRate: null })
    useWatchupStore.setState({
      watchlist: [unavailable],
      selectedCoin: unavailable,
      chartData: chartResponse('KRW-OLD').data,
    })
    render(<DetailArea />)

    expect(screen.getByText('현재 업비트 KRW 마켓에서 조회할 수 없는 코인입니다.')).toBeInTheDocument()
    await waitFor(() => expect(useWatchupStore.getState().chartData).toBeNull())
    expect(featureApi.getCoinChart).not.toHaveBeenCalled()

    const priceError = item({ id: 2, status: 'PRICE_ERROR', currentPrice: null, signedChangeRate: null })
    act(() => useWatchupStore.setState({ watchlist: [priceError], selectedCoin: priceError }))
    expect(screen.getByText('현재가 조회 실패')).toBeInTheDocument()
    expect(featureApi.getCoinChart).not.toHaveBeenCalled()
  })
})

describe('차트 요청 경쟁 상태', () => {
  it('A에서 B로 빠르게 전환하면 A를 abort하고 늦은 A 성공을 버린다', async () => {
    const coinA = item({ id: 1, marketCode: 'KRW-A', koreanName: '에이', symbol: 'A' })
    const coinB = item({ id: 2, marketCode: 'KRW-B', koreanName: '비', symbol: 'B' })
    const pendingA = deferred<CoinChartResponse>()
    const pendingB = deferred<CoinChartResponse>()
    featureApi.getCoinChart.mockImplementation((marketCode: string) => marketCode === 'KRW-A' ? pendingA.promise : pendingB.promise)
    useWatchupStore.setState({ watchlist: [coinA, coinB], selectedCoin: coinA })

    const requestA = useWatchupStore.getState().loadSelectedChart()
    const signalA = featureApi.getCoinChart.mock.calls[0][1] as AbortSignal
    useWatchupStore.getState().selectCoin(coinB.id)
    const requestB = useWatchupStore.getState().loadSelectedChart()

    expect(signalA.aborted).toBe(true)
    pendingA.resolve(chartResponse('KRW-A'))
    await requestA
    expect(useWatchupStore.getState().chartData).toBeNull()

    pendingB.resolve(chartResponse('KRW-B'))
    await requestB
    expect(useWatchupStore.getState().chartData?.marketCode).toBe('KRW-B')
    expect(useWatchupStore.getState().chartMeta).toEqual({ count: 2 })
  })

  it('응답 marketCode가 현재 선택과 다르면 계약 오류로 막는다', async () => {
    const selected = item()
    useWatchupStore.setState({ watchlist: [selected], selectedCoin: selected })
    featureApi.getCoinChart.mockResolvedValue(chartResponse('KRW-XRP'))

    await useWatchupStore.getState().loadSelectedChart()

    expect(useWatchupStore.getState().chartData).toBeNull()
    expect(useWatchupStore.getState().chartError?.code).toBe('INTERNAL_SERVER_ERROR')
  })
})

describe('Recharts 데이터 개수별 렌더링', () => {
  it('0개는 차트 대신 데이터 없음만 표시한다', () => {
    render(<PriceChart chart={chartResponse('KRW-BTC', 0).data} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
    expect(screen.queryByText('상장 이후 제공 가능한 가격 데이터만 표시합니다.')).not.toBeInTheDocument()
  })

  it.each([
    [1, 'point', true],
    [2, 'line', true],
    [29, 'line', true],
    [30, 'line', false],
  ])('%d개 실제 데이터를 %s 모드로 그리고 부족 안내=%s를 구분한다', (count, mode, hasNote) => {
    const { container } = render(<PriceChart chart={chartResponse('KRW-BTC', count).data} />)
    expect(container.querySelector(`[data-chart-mode="${mode}"]`)).toBeInTheDocument()
    const note = screen.queryByText('상장 이후 제공 가능한 가격 데이터만 표시합니다.')
    expect(Boolean(note)).toBe(hasNote)
    if (count === 1) expect(container.querySelector('.recharts-line-dot')).toBeInTheDocument()
  })
})
