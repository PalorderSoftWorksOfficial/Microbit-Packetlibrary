# PalorderSoftWorksPacketLib

**Version:** 1.0  
**License:** MIT  
**Author:** PalorderSoftWorks  

**A structured, binary packet system for Micro:bit radio communications, designed for reliability, extensibility, and ease of use in educational and hobbyist projects.**  

---

## Overview

**PalorderSoftWorksPacketLib** provides a **Minecraft-inspired, application-layer packet protocol** for micro:bit devices using the built-in radio module. It allows developers to:

- Send and receive structured binary packets with unique IDs.  
- Include source and destination identifiers for addressing multiple devices.  
- Use packet flags to request acknowledgments.  
- Build reliable radio protocols without modifying the underlying micro:bit radio driver.  
- Extend the system with custom payloads, registries, and callbacks.  

This library is fully compatible with **MakeCode for micro:bit** and supports **Blocks and TypeScript**.

---

## Features

- **Versioned Protocol:** Ensures compatibility with future updates.  
- **Packet IDs:** Unique identifiers for tracking and acknowledgment.  
- **Source & Destination Addressing:** Specify device IDs to route packets.  
- **Flags Support:** Request ACKs or mark packets as acknowledgments.  
- **Binary Payloads:** Transmit arbitrary data efficiently.  
- **Dispatcher Callback:** Register handlers for received packets.  
- **MakeCode Blocks Integration:** Simple visual programming support.  

---

## Installation

1. Open **MakeCode** for micro:bit.  
2. Go to **Extensions** → search **“PacketLib”** (or add via `.ts` file).  
3. Add the library to your project.  
4. Start using `PacketLib` in **Blocks** or **TypeScript**.

---

## Usage

### Sending a Packet

```ts
let payload = pins.createBuffer(1)
payload[0] = 255

PacketLib.sendPacket(
    0,                      // 0 = auto-generate packet ID
    payload,                // Payload buffer
    "RC",                   // Destination ID
    PacketLib.PacketFlags.None
)
```

### Receiving a Packet

```ts
PacketLib.onReceivePacket(function(packet) {
    if (packet.destination == "RC") {
        maqueen.motorRun(
            maqueen.Motors.All,
            maqueen.Dir.CW,
            packet.payload[0]
        )
    }
})
```

### Using Acknowledgments

```ts
PacketLib.sendPacket(
    0,
    payload,
    "RC",
    PacketLib.PacketFlags.AckRequired
)
```

Packets with `AckRequired` are automatically acknowledged by the receiver.

---

## Packet Structure

| Offset | Size | Description |
|--------|------|-------------|
| 0      | 1    | Protocol Version |
| 1      | 1    | Flags (bitfield) |
| 2–3    | 2    | Packet ID (uint16, little-endian) |
| 4      | 1    | Source ID length |
| 5–…    | N    | Source ID (ASCII) |
| …      | 1    | Destination ID length |
| …      | D    | Destination ID (ASCII) |
| …      | 1    | Payload length |
| …      | P    | Payload bytes |
| …      | 1    | Checksum (XOR of all previous bytes) |

**Flags bitfield:**
- `0x01` = ACK Required  
- `0x02` = Is ACK  

---

## Best Practices

- Keep payloads small (< 32 bytes) to stay within micro:bit radio limits.  
- Always provide unique source IDs if multiple devices are used.  
- Implement a retry mechanism for critical packets, even with ACKs.  
- Use `PacketFlags.AckRequired` only when necessary to reduce radio traffic.  

---

## License

This library is released under the **MIT License**. See the LICENSE file for details.  

> “Do whatever you want, just don’t sue the author.”

---

## Contributing

Contributions are welcome! Suggested improvements include:

- Packet registry (opcode → handler)  
- Extended retry / congestion handling  
- Version negotiation  
- Debugging / logging helpers  
- Blocks enhancements  

---

## Contact

**Author:** PalorderSoftWorks  
**Email / GitHub:** PalorderSoftWorks@gmail.com
