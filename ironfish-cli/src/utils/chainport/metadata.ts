/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Chainport memo metadata encoding and decoding
 * The metadata is encoded in a 64 character hex string
 * The first bit is a flag to indicate if the transaction is to IronFish or from IronFish
 * The next 10 bits are the network id
 * The rest of the bits are the address
 *
 * Official documentation: https://docs.chainport.io/for-developers/integrate-chainport/iron-fish/utilities/ironfishmetadata
 */
export class ChainportMemoMetadata {
  constructor() {}

  public static convertNumberToBinaryString(num: number, padding: number) {
    return num.toString(2).padStart(padding, '0')
  }

  public static encodeNumberTo10Bits(number: number) {
    return this.convertNumberToBinaryString(number, 10)
  }

  public static decodeNumberFrom10Bits(bits: string) {
    return parseInt('0' + bits.slice(1, 10), 2)
  }

  public static encodeCharacterTo6Bits(character: string) {
    var parsedInt = parseInt(character)
    if (!isNaN(parsedInt)) {
      return this.convertNumberToBinaryString(parsedInt, 6)
    }

    var int = character.charCodeAt(0) - 'a'.charCodeAt(0) + 10
    return this.convertNumberToBinaryString(int, 6)
  }

  public static decodeCharFrom6Bits(bits: string) {
    var num = parseInt(bits, 2)
    if (num < 10) {
      return num.toString()
    }
    return String.fromCharCode(num - 10 + 'a'.charCodeAt(0))
  }

  public static encode(networkId: number, address: string, toIronfish: boolean) {
    if (address.startsWith('0x')) {
      address = address.slice(2)
    }

    var encodedNetworkId = this.encodeNumberTo10Bits(networkId)
    var encodedAddress = address
      .toLowerCase()
      .split('')
      .map((character: string) => {
        return this.encodeCharacterTo6Bits(character)
      })
      .join('')

    var combined = (toIronfish ? '1' : '0') + (encodedNetworkId + encodedAddress).slice(1)
    var hexString = BigInt('0b' + combined).toString(16)
    return hexString.padStart(64, '0')
  }

  public static decode(encodedHex: string): [number, string, boolean] {
    var hexInteger = BigInt('0x' + encodedHex)
    var encodedString = hexInteger.toString(2)
    var padded = encodedString.padStart(250, '0')
    var networkId = this.decodeNumberFrom10Bits(padded)

    var toIronfish = padded[0] === '1'
    var addressCharacters = []

    for (let i = 10; i < padded.length; i += 6) {
      var j = i + 6
      var charBits = padded.slice(i, j)
      addressCharacters.push(this.decodeCharFrom6Bits(charBits))
    }

    var address = '0x' + addressCharacters.join('')

    return [networkId, address.toLowerCase(), toIronfish]
  }
}
