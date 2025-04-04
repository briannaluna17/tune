/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Randomizes the order of elements in a given array and returns a new array.
 */
function shuffle<T>(array: ReadonlyArray<T>): Array<T> {
  // From https://stackoverflow.com/a/12646864
  var sliceArr = array.slice()

  for (let i = sliceArr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    ;[sliceArr[i], sliceArr[j]] = [sliceArr[j], sliceArr[i]]
  }

  return sliceArr
}

function sample<T>(array: ReadonlyArray<T>): T | null {
  if (array.length === 0) {
    return null
  }

  return array[Math.floor(Math.random() * array.length)]
}

function remove<T>(array: Array<T>, item: T): boolean {
  for (let i = 0; i < array.length; ++i) {
    if (array[i] === item) {
      array.splice(i, 1)
      return true
    }
  }
  return false
}

export var ArrayUtils = { shuffle, sample, remove }
