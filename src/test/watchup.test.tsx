import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { SearchArea } from '../features/watchup/SearchArea'
import type {
  CreatedWatchlistItem,
  SearchCoinsResponse,
  SearchResult,
  WatchlistItem,
  WatchlistResponse,
} from '../features/watchup/types'
import { useWatchupStore } from '../stores/watchupStore'

const featureApi = vi.hoisted(() => ({
  searchCoins: vi.fn(),
  registerWatchlist: vi.fn(),
  getWatchlist: vi.fn(),
}))
vi.mock('../features/watchup/api', () => featureApi)

const bitcoin: SearchResult = {
  marketCode: 'KRW-BTC',
  koreanName: '비트코인',
  englishName: 'Bitcoin',
  status: 'ACTIVE',
}
const ripple: SearchResult = {
  marketCode: 'KRW-XRP',
  koreanName: '리플',
  englishName: 'XRP',
  status: 'CAUTION',
}
const created: CreatedWatchlistItem = {
  id: 1,
  marketCode: 'KRW-BTC',
  koreanName: '비트코인',
  englishName: 'Bitcoin',
  createdAt: '2026-08-01T00:00:00Z',
}
const bitcoinWatchlist: WatchlistItem = {
  ...created,
  symbol: 'BTC',
  currentPrice: 100,
  signedChangeRate: 1.25,
  status: 'ACTIVE',
  isStale: false,
}

function searchResponse(data: SearchResult[]): SearchCoinsResponse {
  return { data, meta: { count: data.length } }
}

function watchlistResponse(data: WatchlistItem[]): WatchlistResponse {
  return { data, meta: { count: data.length } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function seedResults(results: SearchResult[] = [bitcoin]) {
  useWatchupStore.setState({
    searchQuery: '비트코인',
    searchResults: results,
    hasSearched: true,
  })
}

beforeEach(() => {
  featureApi.searchCoins.mockReset().mockResolvedValue(searchResponse([]))
  featureApi.registerWatchlist.mockReset().mockResolvedValue({ data: created, meta: null })
  featureApi.getWatchlist.mockReset().mockResolvedValue(watchlistResponse([bitcoinWatchlist]))
  useWatchupStore.getState().reset()
})

afterEach(() => {
  useWatchupStore.getState().reset()
})

describe('검색 실행과 상태', () => {
  it('초기·입력 변경·빈 submit에는 요청하지 않고 클릭 검색에는 trim한 검색어를 한 번 전달한다', async () => {
    featureApi.searchCoins.mockResolvedValue(searchResponse([ripple, bitcoin]))
    render(<SearchArea />)
    const input = screen.getByRole('searchbox', { name: '코인명' })
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument()
    expect(featureApi.searchCoins).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '검색' }))
    expect(featureApi.searchCoins).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  비트코인  ' } })
    expect(featureApi.searchCoins).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '검색' }))

    await screen.findByText('리플 (XRP)')
    expect(featureApi.searchCoins).toHaveBeenCalledOnce()
    expect(featureApi.searchCoins.mock.calls[0][0]).toBe('비트코인')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('KRW-XRP'),
      expect.stringContaining('KRW-BTC'),
    ])
    expect(screen.getByRole('button', { name: '리플 관심 코인 등록' })).toBeEnabled()
  })

  it('Enter 한 번으로만 검색하고 input 변경만으로 자동 검색하지 않는다', async () => {
    const user = userEvent.setup()
    featureApi.searchCoins.mockResolvedValue(searchResponse([bitcoin]))
    render(<SearchArea />)

    const input = screen.getByRole('searchbox', { name: '코인명' })
    await user.type(input, 'bitcoin')
    expect(featureApi.searchCoins).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')

    await screen.findByText('비트코인 (BTC)')
    expect(featureApi.searchCoins).toHaveBeenCalledOnce()
    expect(featureApi.searchCoins.mock.calls[0][0]).toBe('bitcoin')
  })

  it('loading 중 고정 문구와 disabled를 표시하고 연속 submit을 한 요청으로 막은 뒤 empty를 구분한다', async () => {
    const pending = deferred<SearchCoinsResponse>()
    featureApi.searchCoins.mockReturnValue(pending.promise)
    render(<SearchArea />)
    const input = screen.getByRole('searchbox', { name: '코인명' })
    const button = screen.getByRole('button', { name: '검색' })
    fireEvent.change(input, { target: { value: '비트코인' } })
    fireEvent.click(button)
    fireEvent.submit(input.closest('form')!)

    expect(screen.getByRole('status')).toHaveTextContent('코인을 검색하는 중입니다.')
    expect(button).toBeDisabled()
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument()
    expect(featureApi.searchCoins).toHaveBeenCalledOnce()

    pending.resolve(searchResponse([]))
    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('검색 실패는 code를 보존하고 고정 두 줄 문구만 표시한다', async () => {
    featureApi.searchCoins.mockRejectedValue(new ApiError(503, 'UPBIT_UNAVAILABLE', '내부 상세'))
    render(<SearchArea />)
    fireEvent.change(screen.getByRole('searchbox', { name: '코인명' }), { target: { value: '비트코인' } })
    fireEvent.click(screen.getByRole('button', { name: '검색' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('코인 검색에 실패했습니다.')
    expect(alert).toHaveTextContent('잠시 후 다시 시도해주세요.')
    expect(alert).not.toHaveTextContent('내부 상세')
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument()
    expect(useWatchupStore.getState().searchError?.code).toBe('UPBIT_UNAVAILABLE')
    expect(screen.getByRole('button', { name: '검색' })).toBeEnabled()
  })

  it('늦은 이전 검색 응답과 cancellation이 최신 결과를 덮어쓰거나 오류로 표시되지 않는다', async () => {
    const first = deferred<SearchCoinsResponse>()
    const second = deferred<SearchCoinsResponse>()
    featureApi.searchCoins.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<SearchArea />)
    const input = screen.getByRole('searchbox', { name: '코인명' })

    fireEvent.change(input, { target: { value: '비트' } })
    fireEvent.submit(input.closest('form')!)
    fireEvent.change(input, { target: { value: '리플' } })
    fireEvent.submit(input.closest('form')!)
    second.resolve(searchResponse([ripple]))
    await screen.findByText('리플 (XRP)')

    first.resolve(searchResponse([bitcoin]))
    await waitFor(() => expect(screen.queryByText('비트코인 (BTC)')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(featureApi.searchCoins.mock.calls[0][1].aborted).toBe(true)
  })

  it('unmount 시 진행 중인 검색을 취소하고 늦은 결과를 store에 반영하지 않는다', async () => {
    const pending = deferred<SearchCoinsResponse>()
    featureApi.searchCoins.mockReturnValue(pending.promise)
    const view = render(<SearchArea />)
    const input = screen.getByRole('searchbox', { name: '코인명' })
    fireEvent.change(input, { target: { value: '비트코인' } })
    fireEvent.submit(input.closest('form')!)
    const signal = featureApi.searchCoins.mock.calls[0][1]

    view.unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve(searchResponse([bitcoin]))
    await pending.promise
    expect(useWatchupStore.getState()).toMatchObject({ searchResults: [], searchLoading: false })
  })
})

describe('관심 코인 등록', () => {
  it('동일 marketCode 빠른 중복 요청을 한 POST로 막고 POST 완료 뒤 GET을 한 번 호출한다', async () => {
    const post = deferred<{ data: CreatedWatchlistItem; meta: null }>()
    featureApi.registerWatchlist.mockReturnValue(post.promise)
    seedResults()
    render(<SearchArea />)
    const button = screen.getByRole('button', { name: '비트코인 관심 코인 등록' })

    fireEvent.click(button)
    void useWatchupStore.getState().registerCoin('KRW-BTC')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('등록 중')
    expect(screen.getByRole('status')).toHaveTextContent('관심 코인을 등록하는 중입니다.')
    expect(featureApi.registerWatchlist).toHaveBeenCalledOnce()
    expect(featureApi.registerWatchlist.mock.calls[0][0]).toBe('KRW-BTC')
    expect(featureApi.getWatchlist).not.toHaveBeenCalled()

    post.resolve({ data: created, meta: null })
    await waitFor(() => expect(featureApi.getWatchlist).toHaveBeenCalledOnce())
    await waitFor(() => expect(useWatchupStore.getState().registerLoading).toBe(false))
    expect(screen.getByRole('searchbox', { name: '코인명' })).toHaveValue('')
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument()
    expect(useWatchupStore.getState().watchlist).toEqual([bitcoinWatchlist])
    expect(useWatchupStore.getState().selectedCoin).toBe(bitcoinWatchlist)
  })

  it('POST 실패는 검색·목록·선택을 유지하고 code와 재시도 가능 상태를 보존한다', async () => {
    const oldItem = { ...bitcoinWatchlist, currentPrice: 90 }
    featureApi.registerWatchlist.mockRejectedValue(new ApiError(400, 'WATCHLIST_LIMIT_EXCEEDED', 'limit detail'))
    seedResults()
    useWatchupStore.setState({ watchlist: [oldItem], selectedCoin: oldItem })
    render(<SearchArea />)
    fireEvent.click(screen.getByRole('button', { name: '비트코인 관심 코인 등록' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('서비스 요청을 처리하지 못했습니다.')
    expect(alert).not.toHaveTextContent('이미 등록된 코인입니다.')
    expect(featureApi.getWatchlist).not.toHaveBeenCalled()
    expect(useWatchupStore.getState()).toMatchObject({
      searchQuery: '비트코인',
      searchResults: [bitcoin],
      watchlist: [oldItem],
      selectedCoin: oldItem,
      registerLoading: false,
    })
    expect(useWatchupStore.getState().registrationError?.code).toBe('WATCHLIST_LIMIT_EXCEEDED')

    fireEvent.click(screen.getByRole('button', { name: '비트코인 관심 코인 등록' }))
    await waitFor(() => expect(featureApi.registerWatchlist).toHaveBeenCalledTimes(2))
  })

  it('409 WATCHLIST_DUPLICATED 알림을 응답당 한 번만 표시하고 GET이나 자동 재시도를 하지 않는다', async () => {
    featureApi.registerWatchlist.mockRejectedValue(new ApiError(409, 'WATCHLIST_DUPLICATED', '중복 내부 상세'))
    seedResults()
    render(<StrictMode><SearchArea /></StrictMode>)
    fireEvent.click(screen.getByRole('button', { name: '비트코인 관심 코인 등록' }))

    expect(await screen.findByText('이미 등록된 코인입니다.')).toBeInTheDocument()
    expect(screen.getAllByText('이미 등록된 코인입니다.')).toHaveLength(1)
    expect(featureApi.registerWatchlist).toHaveBeenCalledOnce()
    expect(featureApi.getWatchlist).not.toHaveBeenCalled()
    expect(screen.getByRole('searchbox', { name: '코인명' })).toHaveValue('비트코인')
    expect(screen.getByText('비트코인 (BTC)')).toBeInTheDocument()
    expect(useWatchupStore.getState().registrationError?.code).toBe('WATCHLIST_DUPLICATED')
  })

  it('GET 결과의 기존 id 선택을 새 참조로 유지하고 새 등록 코인으로 바꾸지 않는다', async () => {
    const oldSelected = { ...bitcoinWatchlist, currentPrice: 90 }
    const refreshedSelected = { ...bitcoinWatchlist, currentPrice: 100 }
    const newCoin: WatchlistItem = {
      ...bitcoinWatchlist,
      id: 2,
      marketCode: 'KRW-XRP',
      koreanName: '리플',
      englishName: 'XRP',
      symbol: 'XRP',
    }
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([refreshedSelected, newCoin]))
    useWatchupStore.setState({ watchlist: [oldSelected], selectedCoin: oldSelected })

    await useWatchupStore.getState().registerCoin('KRW-XRP')

    expect(useWatchupStore.getState().watchlist).toEqual([refreshedSelected, newCoin])
    expect(useWatchupStore.getState().selectedCoin).toBe(refreshedSelected)
    expect(useWatchupStore.getState().selectedCoin).not.toBe(newCoin)
  })

  it('선택 없음일 때 GET 목록이 하나인 첫 등록만 선택하고 두 개 이상이면 임의 선택하지 않는다', async () => {
    await useWatchupStore.getState().registerCoin('KRW-BTC')
    expect(useWatchupStore.getState().selectedCoin).toBe(bitcoinWatchlist)

    useWatchupStore.getState().reset()
    const second = { ...bitcoinWatchlist, id: 2, marketCode: 'KRW-XRP', symbol: 'XRP' }
    featureApi.getWatchlist.mockResolvedValue(watchlistResponse([bitcoinWatchlist, second]))
    await useWatchupStore.getState().registerCoin('KRW-XRP')
    expect(useWatchupStore.getState().selectedCoin).toBeNull()
  })

  it('POST 성공 후 GET 실패는 POST를 재시도하거나 optimistic 항목을 만들지 않고 이전 목록·선택을 유지한다', async () => {
    const oldItem = { ...bitcoinWatchlist, currentPrice: 90 }
    featureApi.getWatchlist.mockRejectedValue(new ApiError(503, 'REDIS_UNAVAILABLE', 'redis detail'))
    seedResults()
    useWatchupStore.setState({ watchlist: [oldItem], selectedCoin: oldItem })
    render(<SearchArea />)
    fireEvent.click(screen.getByRole('button', { name: '비트코인 관심 코인 등록' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('서비스 요청을 처리하지 못했습니다.')
    expect(featureApi.registerWatchlist).toHaveBeenCalledOnce()
    expect(featureApi.getWatchlist).toHaveBeenCalledOnce()
    expect(useWatchupStore.getState()).toMatchObject({
      searchQuery: '',
      searchResults: [],
      watchlist: [oldItem],
      selectedCoin: oldItem,
    })
    expect(useWatchupStore.getState().watchlistError?.code).toBe('REDIS_UNAVAILABLE')
  })

  it('등록 성공이 진행 중인 이전 검색을 무효화해 늦은 검색 결과를 다시 채우지 않는다', async () => {
    const search = deferred<SearchCoinsResponse>()
    featureApi.searchCoins.mockReturnValue(search.promise)
    useWatchupStore.getState().setSearchQuery('비트코인')
    const pendingSearch = useWatchupStore.getState().submitSearch()
    await useWatchupStore.getState().registerCoin('KRW-BTC')

    search.resolve(searchResponse([bitcoin]))
    await pendingSearch
    expect(featureApi.searchCoins.mock.calls[0][1].aborted).toBe(true)
    expect(useWatchupStore.getState()).toMatchObject({
      searchQuery: '',
      searchResults: [],
      hasSearched: false,
    })
  })
})
