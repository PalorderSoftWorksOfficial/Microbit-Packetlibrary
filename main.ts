/**
 * MIT License
 * 
 * Copyright (c) 2026 PalorderSoftWorks
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/**
 * PalorderSoftWorksPacketLib
 *
 * A structured, binary packet protocol implemented on top of the
 * Micro:bit radio buffer transport.
 *
 * This library provides:
 * - Versioned packets
 * - Source & destination addressing
 * - Packet identifiers
 * - ACK support
 * - Binary payload transport
 * - Packet dispatch callbacks
 *
 * Transport guarantees (delivery, ordering, duplication) are NOT
 * provided by the radio layer and must be handled at protocol level.
 * This is the furthest you can with the radio api exposed to Typescript,
 * This is already way to advanced for normal packet handeling.
 */
//% color=#5E3BE1 icon="" block="PacketLib"
namespace PacketLib {
    /**
     * Setup radio defaults for PacketLib
     */
    radio.setGroup(0)

    /**
     * An internal function used to copyBuffers
     */
    function copyBuffer(src: Buffer, dst: Buffer, offset: number): void {
        for (let i = 0; i < src.length && (offset + i) < dst.length; i++) {
            dst[offset + i] = src[i]
        }
    }

    // ===== Constants =====

    const PROTOCOL_VERSION = 1

    const FLAG_ACK_REQUIRED = 0x01
    const FLAG_IS_ACK = 0x02

    // ===== Public Types =====

    /**
     * Represents a decoded packet received from the radio layer.
     */
    export interface Packet {
        version: number
        flags: number
        id: number
        source: string
        destination: string
        payload: Buffer
    }

    /**
     * Packet flag options.
     */
    //% blockNamespace=PacketLib
    export enum PacketFlags {
        //% block="none"
        None = 0,
        //% block="ack required"
        AckRequired = FLAG_ACK_REQUIRED
    }

    // ===== Internal State =====

    let localId = control.deviceSerialNumber().toString()
    let receiveHandler: (packet: Packet) => void = null
    let pendingAcks: number[] = []

    // ===== Utility Functions =====

    function generatePacketId(): number {
        return randint(1, 65535)
    }

    function computeChecksum(buf: Buffer, length: number): number {
        let sum = 0
        for (let i = 0; i < length && i < buf.length; i++) {
            sum ^= buf[i]
        }
        return sum & 0xFF
    }

    function writeString(buf: Buffer, offset: number, value: string): number {
        buf[offset] = value.length
        for (let i = 0; i < value.length && (offset + 1 + i) < buf.length; i++) {
            buf[offset + 1 + i] = value.charCodeAt(i)
        }
        return 1 + value.length
    }

    function readString(buf: Buffer, offset: number): { value: string, size: number } {
        let len = buf[offset]
        if (offset + 1 + len > buf.length) {
            len = Math.max(0, buf.length - (offset + 1))
        }
        let s = ""
        for (let i = 0; i < len; i++) {
            s += String.fromCharCode(buf[offset + 1 + i])
        }
        return { value: s, size: 1 + len }
    }

    // ===== Encoding =====

    function encodePacket(
        id: number,
        destination: string,
        payload: Buffer,
        flags: number
    ): Buffer {

        if (id == 0) id = generatePacketId()

        let payloadLen = payload.length
        if (payloadLen > 255) payloadLen = 255

        let baseSize =
            1 + // version
            1 + // flags
            2 + // id
            1 + localId.length +
            1 + destination.length +
            1 + payloadLen +
            1   // checksum

        let buf = pins.createBuffer(baseSize)
        let offset = 0

        buf[offset++] = PROTOCOL_VERSION
        buf[offset++] = flags
        buf.setNumber(NumberFormat.UInt16LE, offset, id)
        offset += 2

        offset += writeString(buf, offset, localId)
        offset += writeString(buf, offset, destination)

        buf[offset++] = payloadLen
        copyBuffer(payload.slice(0, payloadLen), buf, offset)
        offset += payloadLen

        buf[offset] = computeChecksum(buf, offset)

        return buf
    }

    // ===== Decoding =====

    function decodePacket(buf: Buffer): Packet {
        let offset = 0

        let version = buf[offset++]
        let flags = buf[offset++]
        let id = buf.getNumber(NumberFormat.UInt16LE, offset)
        offset += 2

        let src = readString(buf, offset)
        offset += src.size

        let dst = readString(buf, offset)
        offset += dst.size

        let payloadLen = buf[offset++]
        let end = offset + payloadLen
        if (end > buf.length - 1) end = buf.length - 1
        let payload = buf.slice(offset, end)

        return {
            version: version,
            flags: flags,
            id: id,
            source: src.value,
            destination: dst.value,
            payload: payload
        }
    }

    // ===== Public API =====

    /**
     * Sends a packet to the specified destination.
     *
     * @param id Packet identifier (0 to auto-generate)
     * @param payload Binary payload buffer
     * @param destination Destination identifier
     * @param flags Packet flags
     */
    //% block="send packet id %id payload %payload to %destination flags %flags"
    export function sendPacket(
        id: number,
        payload: Buffer,
        destination: string,
        flags: PacketFlags = PacketFlags.None
    ): void {

        if (id == 0) id = generatePacketId()

        let pkt = encodePacket(id, destination, payload, flags)
        radio.sendBuffer(pkt)

        if (flags & FLAG_ACK_REQUIRED) {
            pendingAcks.push(id)
        }
    }

    /**
     * Registers a handler invoked for every received packet.
     *
     * @param handler Packet handler callback
     */
    //% block="on packet received"
    export function onReceivePacket(handler: (packet: Packet) => void): void {
        receiveHandler = handler
    }

    /**
     * Convert a Micro:bit Buffer into a UTF-8 string.
     * @param buf the buffer to convert
     */
    //% block="convert buffer %buf to string"
    export function bufferToString(buf: Buffer): string {
        let s = ""
        for (let i = 0; i < buf.length; i++) {
            s += String.fromCharCode(buf[i])
        }
        return s
    }

    export function stringToBuffer(s: string): Buffer {
        let buf = pins.createBuffer(s.length)
        for (let i = 0; i < s.length; i++) {
            buf[i] = s.charCodeAt(i)
        }
        return buf
    }

    // ===== Radio Integration =====

    radio.onReceivedBuffer(function (buf) {

        if (!buf || buf.length < 6) return

        let checksum = buf[buf.length - 1]
        if (computeChecksum(buf, buf.length - 1) != checksum) {
            return
        }

        let packet = decodePacket(buf)

        if (packet.flags & FLAG_IS_ACK) {
            let idx = pendingAcks.indexOf(packet.id)
            if (idx >= 0) pendingAcks.removeAt(idx)
            return
        }

        if (packet.flags & FLAG_ACK_REQUIRED) {
            let ack = encodePacket(
                packet.id,
                packet.source,
                pins.createBuffer(0),
                FLAG_IS_ACK
            )
            radio.sendBuffer(ack)
        }

        if (receiveHandler && (packet.destination == localId || packet.destination == "*" || packet.destination == "")) {
            receiveHandler(packet)
        }
    })
}
