# Apex Bluetooth Plugin (Capacitor)

> Scaffolding v13.3.58 — implémentation Swift à finaliser.

## Pourquoi ce plugin

iOS Safari (PWA inclus) **n'expose JAMAIS Web Bluetooth**. Apple n'a pas implémenté l'API et a déclaré qu'il ne le fera pas pour des raisons de privacy/sécurité.

Ce plugin Capacitor wrappe **Core Bluetooth** (framework natif iOS) et expose une API JavaScript équivalente.

## API JS prévue

```typescript
import { ApexBluetooth } from '@apex/bluetooth';

/* Scan devices à proximité (peripherals BLE) */
const devices = await ApexBluetooth.scan({
  serviceUUIDs: ['180F'], /* Battery Service */
  timeoutMs: 5000,
});
/* → [{ id, name, rssi, advertisementData }, ...] */

/* Connect */
const session = await ApexBluetooth.connect({ id: devices[0].id });

/* Discover services + characteristics */
const services = await ApexBluetooth.discoverServices(session.id);
const characteristics = await ApexBluetooth.discoverCharacteristics(session.id, services[0].uuid);

/* Read */
const value = await ApexBluetooth.read(session.id, services[0].uuid, characteristics[0].uuid);

/* Write */
await ApexBluetooth.write(session.id, services[0].uuid, characteristics[0].uuid, new Uint8Array([0x01]));

/* Subscribe notifications */
const subId = await ApexBluetooth.subscribe(session.id, services[0].uuid, characteristics[0].uuid);
ApexBluetooth.addEventListener(`notify-${subId}`, (event) => {
  console.log('Notification:', event.value);
});

/* Disconnect */
await ApexBluetooth.disconnect(session.id);
```

## Implémentation Swift (squelette)

```swift
import Capacitor
import CoreBluetooth

@objc(ApexBluetoothPlugin)
public class ApexBluetoothPlugin: CAPPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    private var centralManager: CBCentralManager!
    private var discoveredPeripherals: [String: CBPeripheral] = [:]

    public override func load() {
        centralManager = CBCentralManager(delegate: self, queue: nil, options: [
            CBCentralManagerOptionRestoreIdentifierKey: getConfig().getString("stateRestorationKey", "apex-bt-restore")
        ])
    }

    @objc func scan(_ call: CAPPluginCall) {
        let serviceUUIDs = (call.getArray("serviceUUIDs") as? [String])?.map { CBUUID(string: $0) }
        let timeoutMs = call.getInt("timeoutMs") ?? 5000

        guard centralManager.state == .poweredOn else {
            call.reject("Bluetooth not powered on")
            return
        }

        discoveredPeripherals.removeAll()
        centralManager.scanForPeripherals(withServices: serviceUUIDs, options: nil)

        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) {
            self.centralManager.stopScan()
            let devices = self.discoveredPeripherals.map { (id, peripheral) -> [String: Any] in
                return [
                    "id": id,
                    "name": peripheral.name ?? "",
                    "rssi": 0,
                ]
            }
            call.resolve(["devices": devices])
        }
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let peripheral = discoveredPeripherals[id] else {
            call.reject("Device not found")
            return
        }
        peripheral.delegate = self
        centralManager.connect(peripheral, options: nil)
        /* TODO: store call for didConnect callback */
        call.resolve(["sessionId": id, "connected": true])
    }

    @objc func read(_ call: CAPPluginCall) {
        /* TODO */
        call.reject("Not implemented yet")
    }

    @objc func write(_ call: CAPPluginCall) {
        /* TODO */
        call.reject("Not implemented yet")
    }

    @objc func subscribe(_ call: CAPPluginCall) {
        /* TODO */
        call.reject("Not implemented yet")
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        /* TODO */
        call.reject("Not implemented yet")
    }

    /* CBCentralManagerDelegate */
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        /* notify JS */
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        let id = peripheral.identifier.uuidString
        discoveredPeripherals[id] = peripheral
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        /* notify JS connected */
    }
}
```

## Permissions Info.plist

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Apex utilise Bluetooth pour découvrir et piloter tes appareils smart home et accessoires</string>

<key>NSBluetoothPeripheralUsageDescription</key>
<string>Apex utilise Bluetooth pour découvrir et piloter tes appareils smart home</string>

<key>UIBackgroundModes</key>
<array>
  <string>bluetooth-central</string>
</array>
```

## Status

🟡 Scaffolding posé. Implémentation native Swift à finaliser dans session ultérieure.
