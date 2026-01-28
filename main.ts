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
 */
//% color=#5E3BE1 icon="" block="PacketLib"
namespace PacketLib {

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
        for (let i = 0; i < length; i++) {
            sum ^= buf[i]
        }
        return sum
    }

    function writeString(buf: Buffer, offset: number, value: string): number {
        buf[offset] = value.length
        for (let i = 0; i < value.length; i++) {
            buf[offset + 1 + i] = value.charCodeAt(i)
        }
        return 1 + value.length
    }

    function readString(buf: Buffer, offset: number): { value: string, size: number } {
        let len = buf[offset]
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

        let baseSize =
            1 + // version
            1 + // flags
            2 + // id
            1 + localId.length +
            1 + destination.length +
            1 + payload.length +
            1   // checksum

        let buf = pins.createBuffer(baseSize)
        let offset = 0

        buf[offset++] = PROTOCOL_VERSION
        buf[offset++] = flags
        buf.setNumber(NumberFormat.UInt16LE, offset, id)
        offset += 2

        offset += writeString(buf, offset, localId)
        offset += writeString(buf, offset, destination)

        buf[offset++] = payload.length
        payload.copyTo(buf, offset)
        offset += payload.length

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
        let payload = buf.slice(offset, payloadLen)

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

    // ===== Radio Integration =====

    radio.onReceivedBuffer(function (buf) {

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

        if (receiveHandler) {
            receiveHandler(packet)
        }
    })
}
