import { Currency as V2Currency, CurrencyAmount, Token as V2Token, TradeType } from '@uniswap/sdk-core'
import { Pair as V2Pair, Route as V2Route } from '@uniswap/v2-sdk'
import { useWeb3React } from '@web3-react/core'
import { useGetBestTrade, useGetCurrency, useGetPairs } from 'hooks/customNetwork/useCustomEntities'
import useDebounce from 'hooks/useDebounce'
import { useMemo } from 'react'
import { InterfaceTrade, TradeState } from 'state/routing/types'
import { convertDecimalToActualAmount } from 'utils/convertAmounts'

/**
 * Returns the best v2+v3 trade for a desired swap.
 * @param tradeType whether the swap is an exact in/out
 * @param amountSpecified the exact amount to swap in/out
 * @param otherCurrency the desired output/payment currency
 */
export function useCustomBestTrade(
  tradeType: TradeType,
  amountSpecified?: CurrencyAmount<V2Currency>,
  otherCurrency?: V2Currency
): {
  state: TradeState
  trade: InterfaceTrade<V2Currency, V2Currency, TradeType> | undefined
} {
  const { chainId, provider } = useWeb3React()

  const [debouncedAmount, debouncedOtherCurrency] = useDebounce(
    useMemo(() => [amountSpecified, otherCurrency], [amountSpecified, otherCurrency]),
    200
  )

  const [inputCurrency, outputCurrency, amountString] = useMemo(() => {
    if (!debouncedAmount || !debouncedOtherCurrency) return [undefined, undefined, undefined]

    const inputCurrency = tradeType === TradeType.EXACT_INPUT ? debouncedAmount.currency : debouncedOtherCurrency
    const outputCurrency = tradeType === TradeType.EXACT_INPUT ? debouncedOtherCurrency : debouncedAmount.currency
    const amountString = convertDecimalToActualAmount(debouncedAmount.toExact(), debouncedAmount.currency)

    return [inputCurrency, outputCurrency, amountString]
  }, [tradeType, debouncedAmount, debouncedOtherCurrency])

  const customInputCurrency = useGetCurrency(inputCurrency)
  const customOutputCurrency = useGetCurrency(outputCurrency)
  const customPairs = useGetPairs(customInputCurrency, customOutputCurrency)
  const bestTrade = useGetBestTrade(customInputCurrency, customOutputCurrency, customPairs, amountString, tradeType)

  const univ2TradeOrEnumState = useMemo(() => {
    if (!chainId || !provider || !inputCurrency || !outputCurrency || !customPairs) return TradeState.LOADING
    if (customPairs.length === 0) return TradeState.NO_ROUTE_FOUND
    if (!bestTrade) return TradeState.INVALID

    const inputCurrencyAmont = CurrencyAmount.fromRawAmount(
      inputCurrency,
      convertDecimalToActualAmount(bestTrade.inputAmount.toExact(), inputCurrency)
    )
    const outputCurrencyAmount = CurrencyAmount.fromRawAmount(
      outputCurrency,
      convertDecimalToActualAmount(bestTrade.outputAmount.toExact(), outputCurrency)
    )

    return new InterfaceTrade({
      v2Routes: [
        {
          routev2: new V2Route(
            bestTrade.route.pairs.map((p) => {
              const token0 = new V2Token(chainId, p.token0.address, p.token0.decimals, p.token0.symbol, p.token0.name)
              const token1 = new V2Token(chainId, p.token1.address, p.token1.decimals, p.token1.symbol, p.token1.name)
              return new V2Pair(
                CurrencyAmount.fromRawAmount(token0, convertDecimalToActualAmount(p.reserve0.toExact(), token0)),
                CurrencyAmount.fromRawAmount(token1, convertDecimalToActualAmount(p.reserve1.toExact(), token1))
              )
            }),
            inputCurrency,
            outputCurrency
          ),
          inputAmount: inputCurrencyAmont,
          outputAmount: outputCurrencyAmount,
        },
      ],
      v3Routes: [],
      mixedRoutes: [],
      tradeType,
      gasUseEstimateUSD: undefined, // TODO
      blockNumber: String(provider._lastBlockNumber),
    })
  }, [tradeType, inputCurrency, outputCurrency, chainId, provider, customPairs, bestTrade])

  // only return gas estimate from api if routing api trade is used
  return useMemo(() => {
    if (univ2TradeOrEnumState instanceof InterfaceTrade) {
      return {
        trade: univ2TradeOrEnumState,
        state: TradeState.VALID,
      }
    }

    return {
      trade: undefined,
      state: univ2TradeOrEnumState,
    }
  }, [univ2TradeOrEnumState])
}
