import { apiRequest } from '../../api/client'
import type {
  CoinChartResponse,
  DeleteWatchlistResponse,
  RegisterWatchlistResponse,
  SearchCoinsResponse,
  WatchlistResponse,
} from './types'

export function searchCoins(query: string, signal?: AbortSignal): Promise<SearchCoinsResponse> {
  const searchParams = new URLSearchParams({ query })
  return apiRequest(`/coins/search?${searchParams.toString()}`, { signal })
}

export function registerWatchlist(
  marketCode: string,
  signal?: AbortSignal,
): Promise<RegisterWatchlistResponse> {
  return apiRequest('/watchlist', {
    method: 'POST',
    body: { marketCode },
    signal,
  })
}

export function getWatchlist(signal?: AbortSignal): Promise<WatchlistResponse> {
  return apiRequest('/watchlist', { signal })
}

export function deleteWatchlistItem(
  id: number,
  signal?: AbortSignal,
): Promise<DeleteWatchlistResponse> {
  return apiRequest(`/watchlist/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    signal,
  })
}

export function getCoinChart(
  marketCode: string,
  signal?: AbortSignal,
): Promise<CoinChartResponse> {
  return apiRequest(`/coins/${encodeURIComponent(marketCode)}/chart`, { signal })
}
