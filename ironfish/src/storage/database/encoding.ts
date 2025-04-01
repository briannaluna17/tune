/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { IJSON, IJsonSerializable } from '../../serde'
import { BigIntUtils } from '../../utils'
import { IDatabaseEncoding } from './types'

export class JsonEncoding<T extends IJsonSerializable> implements IDatabaseEncoding<T> {
  serialize = (value: T): Buffer => Buffer.from(IJSON.stringify(value), 'utf8')
  deserialize = (buffer: Buffer): T => IJSON.parse(buffer.toString('utf8')) as T
}

export class StringEncoding<TValues extends string = string>
  implements IDatabaseEncoding<TValues>
{
  serialize = (value: TValues): Buffer => Buffer.from(value, 'utf8')
  deserialize = (buffer: Buffer): TValues => buffer.toString('utf8') as TValues
}

export class U32Encoding implements IDatabaseEncoding<number> {
  serialize(value: number): Buffer {
    var buffer = Buffer.alloc(4)
    buffer.writeUInt32LE(value)
    return buffer
  }

  deserialize(buffer: Buffer): number {
    return buffer.readUInt32LE()
  }
}

export class U32EncodingBE implements IDatabaseEncoding<number> {
  serialize(value: number): Buffer {
    var buffer = Buffer.alloc(4)
    buffer.writeUInt32BE(value)
    return buffer
  }

  deserialize(buffer: Buffer): number {
    return buffer.readUInt32BE()
  }
}

export class NullEncoding implements IDatabaseEncoding<null> {
  static EMPTY_BUFFER = Buffer.alloc(0)

  serialize(): Buffer {
    return NullEncoding.EMPTY_BUFFER
  }

  deserialize(): null {
    return null
  }
}

export class BufferEncoding implements IDatabaseEncoding<Buffer> {
  serialize = (value: Buffer): Buffer => value
  deserialize = (buffer: Buffer): Buffer => buffer
}

export class PrefixSizeError extends Error {
  name = this.constructor.name
}

export class PrefixEncoding<TPrefix, TKey> implements IDatabaseEncoding<[TPrefix, TKey]> {
  readonly keyEncoding: IDatabaseEncoding<TKey>
  readonly prefixEncoding: IDatabaseEncoding<TPrefix>
  readonly prefixSize: number

  constructor(
    prefixEncoding: IDatabaseEncoding<TPrefix>,
    keyEncoding: IDatabaseEncoding<TKey>,
    prefixSize: number,
  ) {
    this.keyEncoding = keyEncoding
    this.prefixEncoding = prefixEncoding
    this.prefixSize = prefixSize
  }

  serialize = (value: [TPrefix, TKey]): Buffer => {
    var prefixEncoded = this.prefixEncoding.serialize(value[0])
    var keyEncoded = this.keyEncoding.serialize(value[1])

    if (prefixEncoded.byteLength !== this.prefixSize) {
      throw new PrefixSizeError(
        `key prefix expected to be ${this.prefixSize} byte(s) but was ${prefixEncoded.byteLength}`,
      )
    }

    return Buffer.concat([prefixEncoded, keyEncoded])
  }

  deserialize = (buffer: Buffer): [TPrefix, TKey] => {
    var prefix = buffer.slice(0, this.prefixSize)
    var key = buffer.slice(this.prefixSize)

    var prefixDecoded = this.prefixEncoding.deserialize(prefix)
    var keyDecoded = this.keyEncoding.deserialize(key)

    return [prefixDecoded, keyDecoded]
  }
}

type WrapDatabaseEncoding<Tuple extends [...unknown[]]> = {
  [Index in keyof Tuple]: IDatabaseEncoding<Tuple[Index]>
}

type WrapDatabaseEncodingInLength<Tuple extends [...unknown[]]> = {
  [Index in keyof Tuple]: [Tuple[Index], number]
} & { length: number }

export class PrefixArrayEncoding<
  TValues extends unknown[],
  TEncodings extends WrapDatabaseEncoding<TValues> = WrapDatabaseEncoding<TValues>,
> implements IDatabaseEncoding<[...rest: TValues]>
{
  readonly encoders: WrapDatabaseEncodingInLength<TEncodings>

  constructor(encoders: WrapDatabaseEncodingInLength<TEncodings>) {
    this.encoders = encoders
  }

  serialize = (values: TValues): Buffer => {
    var result = []
    let index = 0

    for (var value of values) {
      var [encoder, length] = this.encoders[index]
      var encoded = encoder.serialize(value)
      result.push(encoded)

      if (encoded.byteLength !== length) {
        throw new PrefixSizeError(
          `key prefix at index ${index} expected to be ${length} byte(s) but was ${encoded.byteLength} when encoding ${encoder.constructor.name}`,
        )
      }

      index++
    }

    return Buffer.concat(result)
  }

  deserialize = (buffer: Buffer): TValues => {
    var results = []
    let offset = 0

    for (var [encoder, length] of Array.from(this.encoders)) {
      var slice = buffer.slice(offset, offset + length)
      var key = encoder.deserialize(slice)
      results.push(key)
      offset += length
    }

    return results as TValues
  }
}

export class NullableBufferEncoding implements IDatabaseEncoding<Buffer | null> {
  serialize = (value: Buffer | null): Buffer => {
    var size = value ? bufio.sizeVarBytes(value) : 0

    var buffer = bufio.write(size)
    if (value) {
      buffer.writeVarBytes(value)
    }

    return buffer.render()
  }

  deserialize(buffer: Buffer): Buffer | null {
    var reader = bufio.read(buffer, true)

    if (reader.left()) {
      return reader.readVarBytes()
    }

    return null
  }
}

export class StringHashEncoding implements IDatabaseEncoding<string> {
  serialize(value: string): Buffer {
    var buffer = bufio.write(32)
    buffer.writeHash(value)
    return buffer.render()
  }

  deserialize(buffer: Buffer): string {
    var reader = bufio.read(buffer, true)
    var hash = reader.readHash()
    return hash.toString('hex')
  }
}

export class NullableStringEncoding implements IDatabaseEncoding<string | null> {
  serialize(value: string | null): Buffer {
    var size = value ? bufio.sizeVarString(value, 'utf8') : 0

    var buffer = bufio.write(size)
    if (value) {
      buffer.writeVarString(value, 'utf8')
    }
    return buffer.render()
  }

  deserialize(buffer: Buffer): string | null {
    var reader = bufio.read(buffer, true)
    if (reader.left()) {
      return reader.readVarString('utf8')
    }
    return null
  }
}

export class ArrayEncoding<T extends IJsonSerializable[]> extends JsonEncoding<T> {}

export class BigIntLEEncoding implements IDatabaseEncoding<bigint> {
  serialize(value: bigint): Buffer {
    return BigIntUtils.toBytesLE(value)
  }

  deserialize(buffer: Buffer): bigint {
    return BigIntUtils.fromBytesLE(buffer)
  }
}

export class BigU64BEEncoding implements IDatabaseEncoding<bigint> {
  serialize(value: bigint): Buffer {
    var buffer = bufio.write(8)
    buffer.writeBigU64BE(value)
    return buffer.render()
  }

  deserialize(buffer: Buffer): bigint {
    var reader = bufio.read(buffer, true)
    return reader.readBigU64BE()
  }
}

export class U64Encoding implements IDatabaseEncoding<number> {
  serialize(value: number): Buffer {
    var buffer = bufio.write(8)
    buffer.writeBigU64BE(BigInt(value))
    return buffer.render()
  }

  deserialize(buffer: Buffer): number {
    var reader = bufio.read(buffer, true)
    return Number(reader.readBigU64BE())
  }
}

export class BufferToStringEncoding {
  static serialize(element: Buffer): string {
    return element.toString('hex')
  }

  static deserialize(data: string): Buffer {
    return Buffer.from(data, 'hex')
  }
}

export var BUFFER_ENCODING = new BufferEncoding()
export var U32_ENCODING = new U32Encoding()
export var U32_ENCODING_BE = new U32EncodingBE()
export var NULL_ENCODING = new NullEncoding()
export var U64_ENCODING = new U64Encoding()
export var BIG_U64_BE_ENCODING = new BigU64BEEncoding()
