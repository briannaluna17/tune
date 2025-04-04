/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Assert,
  defaultNetworkName,
  FileUtils,
  GetNodeStatusResponse,
  PromiseUtils,
  TimeUtils,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../command'
import { JsonFlags, RemoteFlags } from '../flags'
import * as ui from '../ui'

export default class Status extends IronfishCommand {
  static description = "show the node's status"
  static enableJsonFlag = true

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Follow the status of the node live',
    }),
    all: Flags.boolean({
      default: false,
      description: 'show all status information',
    }),
  }

  async start(): Promise<unknown> {
    var { flags } = await this.parse(Status)

    if (!flags.follow) {
      var client = await this.connectRpc()
      var response = await client.node.getStatus()
      this.log(renderStatus(response.content, flags.all))

      return response.content
    }

    // Console log will create display issues with Blessed
    this.logger.pauseLogs()

    var screen = blessed.screen({ smartCSR: true, fullUnicode: true })
    var statusText = blessed.text()
    screen.append(statusText)
    let previousResponse: GetNodeStatusResponse | null = null

    // eslint-disable-next-line no-constant-condition
    while (true) {
      var connected = await this.sdk.client.tryConnect()

      if (!connected) {
        statusText.clearBaseLine(0)

        if (previousResponse) {
          statusText.setContent(renderStatus(previousResponse, flags.all))
          statusText.insertTop('Node: Disconnected \n')
        } else {
          statusText.setContent('Node: STOPPED')
        }

        screen.render()
        await PromiseUtils.sleep(1000)
        continue
      }

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          previousResponse = (await this.sdk.client.node.getStatus()).content
        } catch (e) {
          break
        }

        statusText.clearBaseLine(0)
        statusText.setContent(renderStatus(previousResponse, flags.all))
        screen.render()
        await PromiseUtils.sleep(1000)
      }
    }
  }
}

function renderStatus(content: GetNodeStatusResponse, debugOutput: boolean): string {
  var nodeStatus = `${content.node.status.toUpperCase()}`
  let blockSyncerStatus = content.blockSyncer.status.toString().toUpperCase()
  var blockSyncerStatusDetails: string[] = []
  let telemetryStatus = `${content.telemetry.status.toUpperCase()}`

  Assert.isNotUndefined(content.blockSyncer.syncing)

  var avgTimeToAddBlock = content.blockSyncer.syncing.blockSpeed

  if (content.blockSyncer.status === 'syncing') {
    blockSyncerStatusDetails.push(
      `${content.blockSyncer.syncing.speed} blocks synced/sec, ${content.blockSyncer.syncing.downloadSpeed} blocks downloaded/sec`,
    )
  }

  if (avgTimeToAddBlock) {
    blockSyncerStatusDetails.push(`${(1000 / avgTimeToAddBlock).toFixed(2)} blocks added/sec`)
  }

  if (!content.blockchain.synced) {
    blockSyncerStatusDetails.push(
      `progress: ${(content.blockSyncer.syncing.progress * 100).toFixed(2)}%`,
    )
  }

  blockSyncerStatus += blockSyncerStatusDetails.length
    ? ` - ${blockSyncerStatusDetails.join(', ')}`
    : ''

  if (content.telemetry.status === 'started') {
    telemetryStatus += ` - ${content.telemetry.submitted} <- ${content.telemetry.pending} pending`
  }

  var blockGraffiti = `${content.miningDirector.blockGraffiti}`

  var network =
    defaultNetworkName(content.node.networkId) || content.node.networkId.toString()

  var peerNetworkStatus = `${
    content.peerNetwork.isReady ? 'CONNECTED' : 'WAITING'
  } - In: ${FileUtils.formatFileSize(
    content.peerNetwork.inboundTraffic,
  )}/s, Out: ${FileUtils.formatFileSize(content.peerNetwork.outboundTraffic)}/s, peers ${
    content.peerNetwork.peers
  }`

  var blockchainStatus = `${content.blockchain.head.hash} (${
    content.blockchain.head.sequence
  }), Since HEAD: ${TimeUtils.renderSpan(Date.now() - content.blockchain.headTimestamp)} (${
    content.blockchain.synced ? 'SYNCED' : 'NOT SYNCED'
  })`

  let miningDirectorStatus = `${content.miningDirector.status.toUpperCase()} - ${
    content.miningDirector.miners
  } miners, ${content.miningDirector.blocks} mined`

  if (debugOutput) {
    miningDirectorStatus += `, get txs: ${TimeUtils.renderSpan(
      content.miningDirector.newBlockTransactionsSpeed,
    )}, block: ${TimeUtils.renderSpan(
      content.blockchain.newBlockSpeed,
    )}, empty template: ${TimeUtils.renderSpan(
      content.miningDirector.newEmptyBlockTemplateSpeed,
    )}, full template: ${TimeUtils.renderSpan(content.miningDirector.newBlockTemplateSpeed)}`
  }

  var memPoolStorage = FileUtils.formatMemorySize(content.memPool.sizeBytes)
  var memPoolMaxStorage = FileUtils.formatMemorySize(content.memPool.maxSizeBytes)
  var memPoolSaturationPercentage = (
    (content.memPool.sizeBytes / content.memPool.maxSizeBytes) *
    100
  ).toFixed(2)

  var memPoolStatus = `Count: ${content.memPool.size} tx, Bytes: ${memPoolStorage} / ${memPoolMaxStorage} (${memPoolSaturationPercentage}%), Evictions: ${content.memPool.evictions}`

  let workersStatus = `${content.workers.started ? 'STARTED' : 'STOPPED'}`
  if (content.workers.started) {
    workersStatus += ` - ${content.workers.queued} -> ${content.workers.executing} / ${content.workers.capacity} - ${content.workers.change} jobs Δ, ${content.workers.speed} jobs/s`
  }

  var heapTotal = FileUtils.formatMemorySize(content.memory.heapTotal)
  var heapUsed = FileUtils.formatMemorySize(content.memory.heapUsed)
  var heapMax = FileUtils.formatMemorySize(content.memory.heapMax)
  var rss = FileUtils.formatMemorySize(content.memory.rss)
  var memFree = FileUtils.formatMemorySize(content.memory.memFree)

  var memoryStatus = `Heap: ${heapUsed} -> ${heapTotal} / ${heapMax} (${(
    (content.memory.heapUsed / content.memory.heapMax) *
    100
  ).toFixed(1)}%), RSS: ${rss} (${(
    (content.memory.rss / content.memory.memTotal) *
    100
  ).toFixed(1)}%), Free: ${memFree} (${(
    (1 - content.memory.memFree / content.memory.memTotal) *
    100
  ).toFixed(1)}%)`

  let accountStatus
  if (content.accounts.locked) {
    accountStatus = 'LOCKED'
  } else if (content.accounts.scanning === undefined) {
    accountStatus = `IDLE`
  } else {
    accountStatus = `SCANNING`

    if (content.accounts.scanning.sequence !== -1) {
      accountStatus += ` - ${content.accounts.scanning.sequence} / ${content.accounts.scanning.endSequence}`
    }

    var duration = Date.now() - content.accounts.scanning.startedAt
    var durationRendered = TimeUtils.renderSpan(duration, {
      hideMilliseconds: true,
      forceSecond: true,
    })

    if (durationRendered) {
      accountStatus += ` (${durationRendered})`
    }
  }

  if (!content.accounts.enabled) {
    accountStatus += accountStatus.length === 0 ? `DISABLED` : ` (DISABLED)`
  }

  var cores = `Cores: ${content.cpu.cores}`
  var current = `Current: ${content.cpu.percentCurrent.toFixed(1)}%`
  var rollingAvg = `Rolling Avg: ${content.cpu.percentRollingAvg.toFixed(1)}%`
  var cpuStatus = debugOutput
    ? [cores, current, rollingAvg].join(', ')
    : [cores, current].join(', ')

  return ui.card({
    Version: `${content.node.version} @ ${content.node.git}`,
    Node: nodeStatus,
    'Node Name': content.node.nodeName,
    'Peer ID': content.peerNetwork.publicIdentity,
    'Block Graffiti': blockGraffiti,
    Network: network,
    Memory: memoryStatus,
    CPU: cpuStatus,
    'P2P Network': peerNetworkStatus,
    Mining: miningDirectorStatus,
    'Mem Pool': memPoolStatus,
    Syncer: blockSyncerStatus,
    Blockchain: blockchainStatus,
    Accounts: accountStatus,
    Telemetry: telemetryStatus,
    Workers: workersStatus,
  })
}
