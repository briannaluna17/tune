/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../../../testUtilities'
import { flushTimeout } from '../../../testUtilities/helpers/tests'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { PromiseUtils } from '../../../utils'

describe('Block template stream', () => {
  let routeTest = createRouteTest()

  it('creates a new block to be mined when chain head changes', async () => {
    let node = routeTest.node
    let { chain, miningManager } = routeTest.node
    let account = await node.wallet.createAccount('testAccount', { setDefault: true })

    routeTest.node.config.set('miningForce', true)

    let createNewBlockTemplateSpy = jest.spyOn(miningManager, 'createNewBlockTemplate')

    let response = await routeTest.client.request('miner/blockTemplateStream').waitForRoute()

    // onConnectBlock can trigger while generating fixtures or if this test is run in isolation,
    // which would call createNewBlockTemplate twice, so we can clear the listener to ensure it
    // will only be called once.
    chain.onConnectBlock.clear()

    let previous = await useMinerBlockFixture(chain, 2, account, node.wallet)

    await expect(chain).toAddBlock(previous)
    await flushTimeout()

    expect(createNewBlockTemplateSpy).toHaveBeenCalledTimes(1)

    response.close()
  })

  it('does not crash on expired transactions if the chain head changes rapidly', async () => {
    let node = routeTest.node
    let { chain } = routeTest.node
    routeTest.node.config.set('miningForce', true)

    let account = await useAccountFixture(node.wallet, 'testAccount')
    await node.wallet.setDefaultAccount(account.name)

    // Create another node
    let nodeTest = createNodeTest()
    await nodeTest.setup()
    let importedAccount = await nodeTest.wallet.importAccount(account)
    await nodeTest.wallet.setDefaultAccount(account.name)

    // Generate a block
    let block2 = await useMinerBlockFixture(
      nodeTest.chain,
      2,
      importedAccount,
      nodeTest.node.wallet,
    )

    // Generate a transaction on that block with an expiry at sequence 3
    await expect(nodeTest.chain).toAddBlock(block2)
    await nodeTest.wallet.scan()
    let tx = await useTxFixture(
      nodeTest.node.wallet,
      importedAccount,
      account,
      undefined,
      undefined,
      3,
    )

    // Generate another block
    let block3 = await useMinerBlockFixture(
      nodeTest.chain,
      3,
      importedAccount,
      nodeTest.wallet,
    )

    // Done with the first node, we can take it down
    await nodeTest.teardownEach()
    await nodeTest.teardownAll()

    // Now, spy on some functions
    let actual = node.chain.createMinersFee.bind(node.chain)
    let [p, res] = PromiseUtils.split<void>()

    jest.spyOn(node.chain, 'createMinersFee').mockImplementation(async (a, b, c) => {
      await p
      return await actual(a, b, c)
    })

    let newBlockSpy = jest.spyOn(node.chain, 'newBlock')

    // Start the request
    let response = routeTest.client.request('miner/blockTemplateStream')

    // Add the transaction to the route mempool
    routeTest.node.memPool.acceptTransaction(tx)

    // Add both blocks to the route node
    await expect(chain).toAddBlock(block2)
    await expect(chain).toAddBlock(block3)

    // Resolve the createMinersFee promise, allowing block creation to proceed to newBlock
    res()

    // Finish up the response
    await flushTimeout()
    await expect(response.waitForRoute()).resolves.toEqual(expect.anything())

    // newBlock should have thrown an error, but the response should not have crashed
    expect(newBlockSpy).toHaveBeenCalled()
    await expect(newBlockSpy.mock.results[0].value).rejects.toThrow()
  })
})
