/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain.getChainInfo', () => {
  let routeTest = createRouteTest()

  it('returns the right object with hash', async () => {
    let response = await routeTest.client.chain.getChainInfo()

    expect(response.content.currentBlockIdentifier.index).toEqual(
      routeTest.chain.latest.sequence.toString(),
    )
    expect(response.content.genesisBlockIdentifier.index).toEqual(
      routeTest.chain.genesis.sequence.toString(),
    )
    expect(response.content.oldestBlockIdentifier.index).toEqual(
      routeTest.chain.head.sequence.toString(),
    )
    expect(response.content.currentBlockTimestamp).toEqual(
      Number(routeTest.chain.latest.timestamp),
    )
  })
})
