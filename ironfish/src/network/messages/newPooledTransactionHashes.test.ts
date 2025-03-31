/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import { v4 as uuid } from 'uuid'
import { serializePayloadToBuffer } from '../../testUtilities'
import { NewPooledTransactionHashes } from './newPooledTransactionHashes'

describe('PooledTransactionsRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    let hashes = [...Array(10)].map((_) => blake3(uuid()))

    let message = new NewPooledTransactionHashes(hashes)

    let buffer = serializePayloadToBuffer(message)
    let deserializedMessage = NewPooledTransactionHashes.deserializePayload(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
