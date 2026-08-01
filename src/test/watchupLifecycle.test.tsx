import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { DetailArea } from '../features/watchup/DetailArea'
import type { CoinChartResponse, WatchlistItem, WatchlistResponse } from '../features/watchup/types'
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
    currentPrice: 100,
    signedChangeRate: 1.25,
    status: 'ACTIVE',
    isStale: false,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
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
  featureApi.getWatchlist.mockReset()
  featureApi.getCoinChart.mockReset()
  useWatchupStore.getState().reset()
})

afterEach(() => {
  useWatchupStore.getState().reset()
})

describe('대시보드 요청 생명주기', () => {
  it('메인 화면이 실제로 unmount되면 진행 중인 최초 목록 요청을 취소한다', async () => {
    const pending = deferred<WatchlistResponse>()
    featureApi.getWatchlist.mockReturnValue(pending.promise)
    const view = render(<MemoryRouter><HomePage /></MemoryRouter>)
    await waitFor(() => expect(featureApi.getWatchlist).toHaveBeenCalledOnce())
    const signal = featureApi.getWatchlist.mock.calls[0][0] as AbortSignal

    view.unmount()

    await waitFor(() => expect(signal.aborted).toBe(true))
    pending.resolve({ data: [], meta: { count: 0 } })
    await pending.promise
    expect(useWatchupStore.getState().watchlist).toEqual([])
  })

  it('차트 로딩과 고정 실패 문구를 구분하고 서버 오류 code를 보존한다', async () => {
    const selected = item()
    const pending = deferred<CoinChartResponse>()
    featureApi.getCoinChart.mockReturnValue(pending.promise)
    useWatchupStore.setState({ watchlist: [selected], selectedCoin: selected })
    render(<DetailArea />)

    expect(await screen.findByRole('status')).toHaveTextContent('차트를 불러오는 중입니다.')
    pending.reject(new ApiError(503, 'UPBIT_RATE_LIMITED', 'internal'))

    expect(await screen.findByText('차트 데이터를 불러오지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByText('비트코인 (BTC)')).toBeInTheDocument()
    expect(useWatchupStore.getState().chartError?.code).toBe('UPBIT_RATE_LIMITED')
  })

  it('진행 중 차트에서 UNAVAILABLE로 선택하면 요청을 취소하고 차트를 다시 요청하지 않는다', async () => {
    const active = item()
    const unavailable = item({
      id: 2,
      marketCode: 'KRW-OLD',
      koreanName: '이전코인',
      symbol: 'OLD',
      status: 'UNAVAILABLE',
      currentPrice: null,
      signedChangeRate: null,
    })
    const pending = deferred<CoinChartResponse>()
    featureApi.getCoinChart.mockReturnValue(pending.promise)
    useWatchupStore.setState({ watchlist: [active, unavailable], selectedCoin: active })
    render(<DetailArea />)
    await waitFor(() => expect(featureApi.getCoinChart).toHaveBeenCalledOnce())
    const signal = featureApi.getCoinChart.mock.calls[0][1] as AbortSignal

    act(() => useWatchupStore.getState().selectCoin(unavailable.id))

    expect(signal.aborted).toBe(true)
    expect(await screen.findByText('현재 업비트 KRW 마켓에서 조회할 수 없는 코인입니다.')).toBeInTheDocument()
    expect(featureApi.getCoinChart).toHaveBeenCalledOnce()
    expect(useWatchupStore.getState().chartData).toBeNull()
  })
})
