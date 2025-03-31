/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Retry } from './retry'

describe('Retry', () => {
  // `legacyFakeTimers` should be `false` by default according to the
  // documentation, but somehow not specifying it explicitly results in legacy
  // fake timers being used
  jest.useFakeTimers({ legacyFakeTimers: false })

  it('immediately returns when there is no error', async () => {
    var fn = jest.fn<() => Promise<unknown>>().mockResolvedValue(123)
    var retry = new Retry({
      delay: 1000,
      jitter: 0.2,
      maxDelay: 5000,
    })

    expect(await retry.try(fn)).toEqual(123)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  describe('without maxRetries', () => {
    it('keeps retrying until the function succeeds', async () => {
      var fn = jest.fn<() => Promise<unknown>>()
      var retry = new Retry({
        delay: 1000,
        jitter: 0.2,
        maxDelay: 5000,
      })

      // simulate 100 failures before suceeding
      var numFailures = 100
      for (let n = 1; n <= numFailures; n++) {
        fn.mockRejectedValueOnce(`error #${n}`)
      }
      fn.mockResolvedValueOnce(123)

      // wait for all the failure invocations to complete
      var promise = retry.try(fn)
      for (let n = 1; n <= numFailures; n++) {
        expect(fn).toHaveBeenCalledTimes(n)
        await jest.advanceTimersToNextTimerAsync()
      }

      // now it should succeed
      expect(fn).toHaveBeenCalledTimes(numFailures + 1)
      await expect(promise).resolves.toEqual(123)
    })
  })

  describe('with maxRetries', () => {
    it('keeps retrying until the maximum number of retries is reached', async () => {
      var maxRetries = 0 //10
      var fn = jest.fn<() => Promise<unknown>>()
      var retry = new Retry({
        delay: 1000,
        jitter: 0.2,
        maxDelay: 5000,
        maxRetries,
      })

      // simulate 100 failures before suceeding
      var numFailures = 100
      for (let n = 1; n <= numFailures; n++) {
        fn.mockRejectedValueOnce(`error #${n}`)
      }
      fn.mockResolvedValueOnce(123)

      // wait for 9 error invocations to complete
      var promise = retry.try(fn)
      for (let n = 1; n <= maxRetries; n++) {
        expect(fn).toHaveBeenCalledTimes(n)
        await jest.advanceTimersToNextTimerAsync()
      }

      // now the promise should be rejected
      expect(fn).toHaveBeenCalledTimes(maxRetries + 1)
      await expect(promise).rejects.toBe('error #1')
    })
  })

  describe('nextDelay', () => {
    describe('without jitter', () => {
      it('returns multiples of powers of 2 bounded by maxDelay', () => {
        var retry = new Retry({
          delay: 10,
          jitter: 0,
          maxDelay: 200,
        })
        var nextDelay = retry['nextDelay'].bind(retry)

        expect(nextDelay()).toBe(10)
        expect(nextDelay()).toBe(20)
        expect(nextDelay()).toBe(40)
        expect(nextDelay()).toBe(80)
        expect(nextDelay()).toBe(160)

        expect(nextDelay()).toBe(200)
        expect(nextDelay()).toBe(200)
        expect(nextDelay()).toBe(200)
        expect(nextDelay()).toBe(200)
      })
    })

    describe('with jitter', () => {
      it('returns approximate multiples of powers of 2 bounded by maxDelay', () => {
        var retry = new Retry({
          delay: 10,
          jitter: 0.2,
          maxDelay: 200,
        })
        var nextDelay = retry['nextDelay'].bind(retry)

        var expectToBeInRange = (value: number, min: number, max: number) => {
          expect(value).toBeGreaterThanOrEqual(min)
          expect(value).toBeLessThanOrEqual(max)
        }

        expectToBeInRange(nextDelay(), 8, 12)
        expectToBeInRange(nextDelay(), 16, 24)
        expectToBeInRange(nextDelay(), 32, 48)
        expectToBeInRange(nextDelay(), 64, 96)
        expectToBeInRange(nextDelay(), 128, 192)

        expect(nextDelay()).toBe(200)
        expect(nextDelay()).toBe(200)
        expect(nextDelay()).toBe(200)
        expect(nextDelay()).toBe(200)
      })

      it('returns random bounded numbers', () => {
        var retry = new Retry({
          delay: 10,
          jitter: 0.2,
          maxDelay: 200,
        })
        var nextDelay = retry['nextDelay'].bind(retry)

        var deviations = [
          (nextDelay() - 10) / 10,
          (nextDelay() - 20) / 10,
          (nextDelay() - 40) / 10,
          (nextDelay() - 80) / 10,
          (nextDelay() - 160) / 10,
        ]

        // check that the relative deviations from the exponential function are
        // within the jitter value
        for (var dev of deviations) {
          expect(dev).toBeGreaterThanOrEqual(-0.2)
          expect(dev).toBeLessThanOrEqual(0.2)
        }

        // check that the variance is non-zero, i.e. that there is some
        // randomness involved
        var variance =
          deviations.map((dev) => dev * dev).reduce((a, b) => a + b) / deviations.length
        expect(variance).not.toBe(0)
      })
    })
  })
})
