# MQTT‑Thorium‑Middleware

*A Thorium client that bridges GraphQL and MQTT for hardware panel integration.*

---

## Overview

This middleware allows **Thorium** to communicate with physical hardware panels via **MQTT**. It serves as a bridge:

* **GraphQL → MQTT:** Subscriptions in Thorium can publish updates to MQTT topics based on programmatic mappings. Only relevant values are pushed — unchanged data is ignored to prevent redundant MQTT traffic.
* **MQTT → GraphQL:** Incoming MQTT messages on certain topics trigger GraphQL mutations in Thorium. Again, only mapped topics will cause mutations.

This makes it possible to:

* Control Thorium systems from physical hardware (switches, dials, panels).
* Push Thorium updates (like system status) to MQTT, so hardware panels reflect the state of the simulation.

This has been tested on Thorium 3.12.1 and the MQTT broker EMQX

---

## Architecture & Flow

1. **Startup**

   * Reads configuration from `.env` file.
   * Connects to Thorium server (auto-detected via Bonjour or specified).
   * Connects to MQTT broker and subscribes to relevant topics.

2. **GraphQL Subscription Update**

   * When Thorium emits a change (e.g., Warp Engines damaged), the middleware checks mapping.
   * If mapped and value has changed, it publishes to MQTT (e.g., `voyager/system/Warp/status → damaged`).

3. **MQTT Message Arrival**

   * If the message matches a mapped topic (e.g., `voyager/system/Reactor/setheat → 0.5`), the corresponding GraphQL mutation is triggered in Thorium.

4. **Special Behavior**

   * **Trigger Macros:** Publishing to `voyager/triggerMacro/{macroName}` will attempt to run that macro in Thorium. If no such macro exists, nothing happens.
   * **Dynamic Notifications:** Thorium macros, macrobuttons, or timeline steps can send `notify` actions to the defined MQTT station. These appear on topics like `voyager/notification/{notification title}`.

---

## Configuration

Configuration is handled through a `.env` file.

| Variable                   | Description                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `STATION_NAME`             | Name of the station that will appear in Thorium for assignment.                                                                        |
| `PREFERRED_THORIUM_SERVER` | Preferred Thorium server hostname/IP. Auto-connects when found; otherwise lists available servers.                                     |
| `PREFERRED_MQTT_BROKER`    | Hostname/IP of the MQTT broker to connect to.                                                                                          |
| `BASE_MQTT_STRING`         | Base MQTT string prefix (e.g., `voyager/`). Useful when multiple clients connect to multiple Thorium servers but share an MQTT broker. |

---

## Examples

### Thorium → MQTT

* Warp Engines damaged → publish:

  ```
  voyager/system/Warp/status = "damaged"
  ```

### MQTT → Thorium

* Set reactor heat:

  ```
  voyager/system/Reactor/setheat = 0.5
  ```

  → triggers GraphQL mutation to alter reactor heat in Thorium.

* Set phaser system power:

  ```
  test/system/Phaser/setpower = 0.8
  ```

* Set reactor efficiency:

  ```
  test/system/Reactor/setEfficiency = 0.9
  ```

### Special: Trigger a Macro

* Publish to:

  ```
  voyager/triggerMacro/RedAlert
  ```

  → runs the `RedAlert` macro in Thorium (if it exists).

### Special: Notifications from Thorium

* Thorium `notify` action sends message body to:

  ```
  voyager/notification/{notification title}
  ```

---

## Installation & Running

### Requirements

* Node.js (v14+ recommended)
* Access to a Thorium server
* MQTT broker

### Install

```bash
git clone https://github.com/Emrix/MQTT-Thorium-Middleware.git
cd MQTT-Thorium-Middleware
npm install
```

### Configure

Create a `.env` file with required values:

```env
STATION_NAME=PanelClient
PREFERRED_THORIUM_SERVER=thorium.local
PREFERRED_MQTT_BROKER=mqtt://localhost:1883
BASE_MQTT_STRING=voyager/
```

### Run

```bash
node index.js
```

---

## Future Improvements

* Richer mapping configuration (e.g., external mapping files)
* MQTT username/password authentication
* Network resiliency & retry policies
* Enhanced logging & log level controls
* Docker containerization
* More topic-to-GraphQL mappings (subscriptions & mutations)

---

## License

MIT License — see [LICENSE](./LICENSE) for details.
