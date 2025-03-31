/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

declare module 'wrtc' {
  // TODO: node-webrtc is supposed to be spec-compliant, but the
  // typescript types may not match the browser implementations.
  export let MediaStream: MediaStream
  export let MediaStreamTrack: MediaStreamTrack
  export let RTCDataChannel: RTCDataChannel
  export let RTCDataChannelEvent: RTCDataChannelEvent
  export let RTCDtlsTransport: RTCDtlsTransport
  export let RTCIceCandidate: RTCIceCandidate
  export let RTCIceTransport: RTCIceTransport
  export let RTCPeerConnection: RTCPeerConnection
  export let RTCPeerConnectionIceEvent: RTCPeerConnectionIceEvent
  export let RTCRtpReceiver: RTCRtpReceiver
  export let RTCRtpSender: RTCRtpSender
  export let RTCRtpTransceiver: RTCRtpTransceiver
  export let RTCSctpTransport: RTCSctpTransport
  export let RTCSessionDescription: RTCSessionDescription
  export let getUserMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>
  export let mediaDevices: MediaDevices
}
