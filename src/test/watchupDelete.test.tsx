import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { DetailArea } from '../features/watchup/DetailArea'
import { SearchArea } from '../features/watchup/SearchArea'
import { WatchlistArea } from '../features/watchup/WatchlistArea'
import type {
  CoinChartResponse,
  DeleteWatchlistResponse,
  SearchResult,
  WatchlistItem,
  WatchlistResponse,
} from '../features/watchup/types'
import { HomePage } from '../pages/HomePage'
import { useWatchupStore } from '../stores/watchupStore'

const featureApi = vi.hoisted(() => ({
  searchCoins: vi.fn(),
  registerWatchlist: vi.fn(),
  getWatchlist: vi.fn(),
  deleteWatchlistItem: vi.fn(),
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

function watchlistResponse(data: WatchlistItem[]): WatchlistResponse {
  return { data, meta: { count: data.length } }
}

function deleteResponse(id: number): DeleteWatchlistResponse {
  return { data: { id }, meta: null }
}

function chartResponse(marketCode: string): CoinChartResponse {
  return {
    data: {
      marketCode,
      period: '30d',
      candles: [{ date: '2026-06-16', closingPrice: 100 }],
    },
    meta: { count: 1 },
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

const searchResult: SearchResult = {
  marketCode: 'KRW-XRP',
  koreanName: '리플',
  englishName: 'XRP',
  status: 'ACTIVE',
}

beforeEach(() => {
  featureApi.searchCoins.mockReset().mockResolvedValue({ data: [], meta: { count: 0 } })
  featureApi.registerWatchlist.mockReset()
  featureApi.getWatchlist.mockReset().mockResolvedValue(watchlistResponse([]))
  featureApi.deleteWatchlistItem.mockReset().mockResolvedValue(deleteResponse(1))
  featureApi.getCoinChart.mockReset().mockImplementation((marketCode: string) => Promise.resolve(chartResponse(marketCode)))
  useWatchupStore.getState().reset()
})

afterEach(() => {
  vi.restoreAllMocks()
  useWatchupStore.getState().reset()
})

describe('삭제 confirm과 이벤트 분리', () => {
  it('confirm 취소는 API와 목록·선택·차트·삭제 상태를 변경하지 않는다', () => {
    const target = item()
    const selected = item({ id: 2, marketCode: 'KRW-ETH', koreanName: '이더리움', symbol: 'ETH' })
    const chart = chartResponse('KRW-ETH').data
    const previousError = new ApiError(500, 'PREVIOUS_DELETE_ERROR', 'internal')
    useWatchupStore.setState({
      watchlist: [target, selected],
      selectedCoin: selected,
      chartData: chart,
      chartMeta: { count: 1 },
      deleteError: previousError,
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<WatchlistArea />)

    fireEvent.click(screen.getByRole('button', { name: '비트코인 삭제' }))

    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledWith('비트코인을 관심 코인에서 삭제하시겠습니까?')
    expect(featureApi.deleteWatchlistItem).not.toHaveBeenCalled()
    expect(featureApi.getWatchlist).not.toHaveBeenCalled()
    expect(useWatchupStore.getState()).toMatchObject({
      watchlist: [target, selected],
      selectedCoin: selected,
      chartData: chart,
      deleteLoading: false,
      deletingId: null,
      deleteError: previousError,
    })
  })

  it('선택 control과 삭제 button은 중첩되지 않고 Enter·Space 삭제가 행 선택을 발생시키지 않는다', async () => {
    const user = userEvent.setup()
    const target = item()
    const selected = item({ id: 2, marketCode: 'KRW-ETH', koreanName: '이더리움', symbol: 'ETH' })
    useWatchupStore.setState({ watchlist: [target, selected], selectedCoin: selected })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<WatchlistArea />)
    const selectButton = screen.getByRole('button', { name: '비트코인 선택' })
    const deleteButton = screen.getByRole('button', { name: '비트코인 삭제' })

    expect(selectButton.contains(deleteButton)).toBe(false)
    deleteButton.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(confirm).toHaveBeenCalledTimes(2)
    expect(useWatchupStore.getState().selectedCoin).toBe(selected)
    expect(screen.getByRole('button', { name: '이더리움 선택' })).toHaveAttribute('aria-current', 'true')
  })
})

describe('DELETE 성공 후 서버 목록 reconciliation', () => {
  it('비선택 항목은 DELETE 뒤 GET 완료 전까지 유지하고 기존 선택을 최신 객체로 재연결한다', async () => {
    const target = item()
    const selected = item({ id: 2, marketCode: 'KRW-ETH', koreanName: '이더리움', symbol: 'ETH', currentPrice: 90 })
    const refreshedSelected = { ...selected, currentPrice: 110 }
    const third = item({ id: 3, marketCode: 'KRW-XRP', koreanName: '리플', symbol: 'XRP' })
    const chart = chartResponse('KRW-ETH').data
    const pendingDelete = deferred<DeleteWatchlistResponse>()
    const pendingRefresh = deferred<WatchlistResponse>()
    const order: string[] = []
    featureApi.deleteWatchlistItem.mockImplementation(() => {
      order.push('DELETE')
      return pendingDelete.promise
    })
    featureApi.getWatchlist.mockImplementation(() => {
      order.push('GET')
      return pendingRefresh.promise
    })
    useWatchupStore.setState({
      watchlist: [target, selected],
      selectedCoin: selected,
      chartData: chart,
      chartMeta: { count: 1 },
      searchQuery: '리플',
      searchResults: [searchResult],
      hasSearched: true,
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<><SearchArea /><WatchlistArea /></>)

    fireEvent.click(screen.getByRole('button', { name: '비트코인 삭제' }))

    expect(order).toEqual(['DELETE'])
    expect(featureApi.deleteWatchlistItem).toHaveBeenCalledWith(target.id, expect.any(AbortSignal))
    expect(useWatchupStore.getState().watchlist).toEqual([target, selected])
    expect(useWatchupStore.getState().selectedCoin).toBe(selected)
    expect(screen.getByText('관심 코인을 삭제하는 중입니다.')).toBeInTheDocument()
    screen.getAllByRole('button', { name: / 삭제$/ }).forEach((button) => expect(button).toBeDisabled())
    expect(screen.getByRole('button', { name: '리플 관심 코인 등록' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '검색' })).toBeEnabled()

    pendingDelete.resolve(deleteResponse(target.id))
    await waitFor(() => expect(order).toEqual(['DELETE', 'GET']))
    expect(useWatchupStore.getState().watchlist).toEqual([target, selected])
    expect(useWatchupStore.getState().deleteLoading).toBe(true)

    pendingRefresh.resolve(watchlistResponse([refreshedSelected, third]))
    await waitFor(() => expect(useWatchupStore.getState().deleteLoading).toBe(false))

    expect(useWatchupStore.getState().watchlist).toEqual([refreshedSelected, third])
    expect(useWatchupStore.getState().selectedCoin).toBe(refreshedSelected)
    expect(useWatchupStore.getState().chartData).toBe(chart)
    expect(screen.getAllByRole('button', { name: / 선택$/ }).map((button) => button.getAttribute('aria-label')))
      .toEqual(['이더리움 선택', '리플 선택'])
    expect(featureApi.getCoinChart).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '리플 관심 코인 등록' })).toBeEnabled()
  })

  it('선택 항목 삭제 후 서버 첫 ACTIVE 항목을 선택하고 새 차트를 요청한다', async () => {
    const selected = item({ id: 2, marketCode: 'KRW-ETH', koreanName: '이더리움', symbol: 'ETH' })
    const first = item({ id: 9, marketCode: 'KRW-XRP', koreanName: '리플', symbol: 'XRP' })
    const second = item({ id: 1 })
    featureApi.deleteWatchlistItem.mockResolvedValue(deleteResponse(selected.id))
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([first, second]))
    useWatchupStore.setState({
      watchlist: [selected, first, second],
      selectedCoin: selected,
      chartData: chartResponse(selected.marketCode).data,
      chartMeta: { count: 1 },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<><WatchlistArea /><DetailArea /></>)

    fireEvent.click(screen.getByRole('button', { name: '이더리움 삭제' }))

    await waitFor(() => expect(useWatchupStore.getState().selectedCoin).toBe(first))
    await waitFor(() => expect(featureApi.getCoinChart).toHaveBeenCalledOnce())
    expect(featureApi.getCoinChart.mock.calls[0][0]).toBe('KRW-XRP')
    expect(useWatchupStore.getState().chartData?.marketCode).toBe('KRW-XRP')
    expect(screen.getByRole('button', { name: '리플 선택' })).toHaveAttribute('aria-current', 'true')
  })

  it('선택 항목 삭제 후 서버 첫 항목이 UNAVAILABLE이면 이전 차트를 지우고 새 차트를 요청하지 않는다', async () => {
    const selected = item({ id: 2, marketCode: 'KRW-ETH', koreanName: '이더리움', symbol: 'ETH' })
    const unavailable = item({
      id: 9,
      marketCode: 'KRW-OLD',
      koreanName: '이전코인',
      symbol: 'OLD',
      status: 'UNAVAILABLE',
      currentPrice: null,
      signedChangeRate: null,
    })
    featureApi.deleteWatchlistItem.mockResolvedValue(deleteResponse(selected.id))
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([unavailable]))
    useWatchupStore.setState({
      watchlist: [selected, unavailable],
      selectedCoin: selected,
      chartData: chartResponse(selected.marketCode).data,
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<><WatchlistArea /><DetailArea /></>)

    fireEvent.click(screen.getByRole('button', { name: '이더리움 삭제' }))

    expect(await screen.findByText('현재 업비트 KRW 마켓에서 조회할 수 없는 코인입니다.')).toBeInTheDocument()
    expect(useWatchupStore.getState().selectedCoin).toBe(unavailable)
    expect(useWatchupStore.getState().chartData).toBeNull()
    expect(featureApi.getCoinChart).not.toHaveBeenCalled()
  })

  it('마지막 항목 삭제는 목록·선택·차트를 비우고 늦은 이전 차트 응답을 차단한다', async () => {
    const only = item()
    const pendingChart = deferred<CoinChartResponse>()
    featureApi.getCoinChart.mockReturnValue(pendingChart.promise)
    featureApi.deleteWatchlistItem.mockResolvedValue(deleteResponse(only.id))
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([]))
    useWatchupStore.setState({ watchlist: [only], selectedCoin: only })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<><SearchArea /><WatchlistArea /><DetailArea /></>)
    await waitFor(() => expect(featureApi.getCoinChart).toHaveBeenCalledOnce())
    const chartSignal = featureApi.getCoinChart.mock.calls[0][1] as AbortSignal

    fireEvent.click(screen.getByRole('button', { name: '비트코인 삭제' }))

    expect(await screen.findByText('등록된 관심 코인이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('코인명을 검색하여', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('표시할 코인이 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '코인명' })).toBeEnabled()
    expect(chartSignal.aborted).toBe(true)
    expect(useWatchupStore.getState()).toMatchObject({
      watchlist: [],
      selectedCoin: null,
      chartData: null,
      chartMeta: null,
      chartLoading: false,
    })

    pendingChart.resolve(chartResponse(only.marketCode))
    await pendingChart.promise
    await act(async () => Promise.resolve())
    expect(useWatchupStore.getState().chartData).toBeNull()
    expect(featureApi.getCoinChart).toHaveBeenCalledOnce()
  })
})

describe('삭제 실패와 재조회 실패', () => {
  it.each([
    [403, 'FORBIDDEN'],
    [404, 'WATCHLIST_NOT_FOUND'],
    [500, 'INTERNAL_SERVER_ERROR'],
  ])('DELETE %i 실패는 GET 없이 기존 화면을 유지하고 code %s를 보존한다', async (status, code) => {
    const selected = item()
    const chart = chartResponse(selected.marketCode).data
    featureApi.deleteWatchlistItem.mockRejectedValue(new ApiError(status, code, 'internal', { id: selected.id }))
    useWatchupStore.setState({
      watchlist: [selected],
      selectedCoin: selected,
      chartData: chart,
      chartMeta: { count: 1 },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<WatchlistArea />)

    fireEvent.click(screen.getByRole('button', { name: '비트코인 삭제' }))

    expect(await screen.findByText('서비스 요청을 처리하지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByText('잠시 후 다시 시도해주세요.')).toBeInTheDocument()
    expect(featureApi.getWatchlist).not.toHaveBeenCalled()
    expect(useWatchupStore.getState()).toMatchObject({
      watchlist: [selected],
      selectedCoin: selected,
      chartData: chart,
      deleteLoading: false,
      deletingId: null,
    })
    expect(useWatchupStore.getState().deleteError).toMatchObject({ status, code, details: { id: selected.id } })
    expect(screen.getByRole('button', { name: '비트코인 삭제' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '비트코인 삭제' }))
    await waitFor(() => expect(featureApi.deleteWatchlistItem).toHaveBeenCalledTimes(2))
  })

  it('DELETE 성공 후 GET 실패는 기존 화면을 유지하고 Empty State로 위장하지 않는다', async () => {
    const selected = item()
    const chart = chartResponse(selected.marketCode).data
    featureApi.deleteWatchlistItem.mockResolvedValue(deleteResponse(selected.id))
    featureApi.getWatchlist.mockRejectedValue(new ApiError(503, 'REDIS_UNAVAILABLE', 'internal'))
    useWatchupStore.setState({ watchlist: [selected], selectedCoin: selected, chartData: chart })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<WatchlistArea />)

    fireEvent.click(screen.getByRole('button', { name: '비트코인 삭제' }))

    expect(await screen.findByText('서비스 요청을 처리하지 못했습니다.')).toBeInTheDocument()
    expect(featureApi.deleteWatchlistItem).toHaveBeenCalledOnce()
    expect(featureApi.getWatchlist).toHaveBeenCalledOnce()
    expect(useWatchupStore.getState()).toMatchObject({
      watchlist: [selected],
      selectedCoin: selected,
      chartData: chart,
      deleteLoading: false,
      deleteError: null,
      deleteRefreshFailed: true,
    })
    expect(useWatchupStore.getState().watchlistError?.code).toBe('REDIS_UNAVAILABLE')
    expect(screen.queryByText('등록된 관심 코인이 없습니다.')).not.toBeInTheDocument()
  })
})

describe('삭제 중복·mutation 경쟁과 생명주기', () => {
  it('action 수준에서 같은 항목과 다른 항목의 동시 DELETE를 하나로 막고 등록도 차단한다', async () => {
    const firstItem = item()
    const secondItem = item({ id: 2, marketCode: 'KRW-ETH', koreanName: '이더리움', symbol: 'ETH' })
    const pendingDelete = deferred<DeleteWatchlistResponse>()
    featureApi.deleteWatchlistItem.mockReturnValue(pendingDelete.promise)
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([secondItem]))
    useWatchupStore.setState({ watchlist: [firstItem, secondItem], selectedCoin: firstItem })

    const first = useWatchupStore.getState().deleteCoin(firstItem.id)
    const duplicate = useWatchupStore.getState().deleteCoin(firstItem.id)
    const different = useWatchupStore.getState().deleteCoin(secondItem.id)
    await useWatchupStore.getState().registerCoin('KRW-XRP')

    expect(duplicate).toBe(first)
    expect(different).toBe(first)
    expect(featureApi.deleteWatchlistItem).toHaveBeenCalledOnce()
    expect(featureApi.registerWatchlist).not.toHaveBeenCalled()
    pendingDelete.resolve(deleteResponse(firstItem.id))
    await first
    expect(useWatchupStore.getState().deleteLoading).toBe(false)
  })

  it('등록 mutation 중에는 action 수준에서 삭제 요청을 시작하지 않는다', async () => {
    const pendingRegister = deferred<{ data: { id: number; marketCode: string; koreanName: string; englishName: string; createdAt: string }; meta: null }>()
    featureApi.registerWatchlist.mockReturnValue(pendingRegister.promise)
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([item()]))

    const registration = useWatchupStore.getState().registerCoin('KRW-BTC')
    await useWatchupStore.getState().deleteCoin(1)

    expect(featureApi.deleteWatchlistItem).not.toHaveBeenCalled()
    pendingRegister.resolve({
      data: {
        id: 1,
        marketCode: 'KRW-BTC',
        koreanName: '비트코인',
        englishName: 'Bitcoin',
        createdAt: '2026-08-01T00:00:00Z',
      },
      meta: null,
    })
    await registration
  })

  it('삭제 후 GET은 이전 목록 GET을 abort하고 늦은 응답이 삭제 항목을 되살리지 못하게 한다', async () => {
    const deleted = item()
    const survivor = item({ id: 2, marketCode: 'KRW-ETH', koreanName: '이더리움', symbol: 'ETH' })
    const stale = deferred<WatchlistResponse>()
    const fresh = deferred<WatchlistResponse>()
    featureApi.getWatchlist
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise)
    featureApi.deleteWatchlistItem.mockResolvedValue(deleteResponse(deleted.id))
    useWatchupStore.setState({ watchlist: [deleted, survivor], selectedCoin: deleted })

    const initialRequest = useWatchupStore.getState().loadInitialWatchlist()
    const staleSignal = featureApi.getWatchlist.mock.calls[0][0] as AbortSignal
    const deletion = useWatchupStore.getState().deleteCoin(deleted.id)
    await waitFor(() => expect(featureApi.getWatchlist).toHaveBeenCalledTimes(2))
    expect(staleSignal.aborted).toBe(true)

    stale.resolve(watchlistResponse([deleted, survivor]))
    await initialRequest
    fresh.resolve(watchlistResponse([survivor]))
    await deletion

    expect(useWatchupStore.getState().watchlist).toEqual([survivor])
    expect(useWatchupStore.getState().selectedCoin).toBe(survivor)
  })

  it('메인 화면 unmount는 진행 중 DELETE를 abort하고 늦은 성공 뒤 GET을 시작하지 않는다', async () => {
    const target = item()
    const pendingDelete = deferred<DeleteWatchlistResponse>()
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([target]))
    featureApi.deleteWatchlistItem.mockReturnValue(pendingDelete.promise)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const view = render(<MemoryRouter><HomePage /></MemoryRouter>)
    const deleteButton = await screen.findByRole('button', { name: '비트코인 삭제' })

    fireEvent.click(deleteButton)
    const signal = featureApi.deleteWatchlistItem.mock.calls[0][1] as AbortSignal
    view.unmount()

    await waitFor(() => expect(signal.aborted).toBe(true))
    pendingDelete.resolve(deleteResponse(target.id))
    await pendingDelete.promise
    await act(async () => Promise.resolve())
    expect(featureApi.getWatchlist).toHaveBeenCalledOnce()
    expect(useWatchupStore.getState()).toMatchObject({ deleteLoading: false, deletingId: null })
  })
})

describe('Empty·Loading 상태', () => {
  it('목록 loading과 오류를 Empty State로 표시하지 않는다', () => {
    useWatchupStore.setState({ watchlist: [], watchlistLoading: true })
    const view = render(<WatchlistArea />)
    expect(screen.getByText('관심 코인을 불러오는 중입니다.')).toBeInTheDocument()
    expect(screen.queryByText('등록된 관심 코인이 없습니다.')).not.toBeInTheDocument()

    act(() => useWatchupStore.setState({
      watchlistLoading: false,
      watchlistError: new ApiError(503, 'REDIS_UNAVAILABLE', 'internal'),
    }))
    expect(screen.getByText('서비스 요청을 처리하지 못했습니다.')).toBeInTheDocument()
    expect(screen.queryByText('등록된 관심 코인이 없습니다.')).not.toBeInTheDocument()
    view.unmount()
  })
})
