require('dotenv').config();
const logger = require('./logger');
console.log("UTC Time:", new Date());

//////////////////////
// Start MQTT Client//
////////////////////
const MqttClient = require("./mqttClient");
let mqttSubscribedTopics = {};

MqttClient.connect(process.env['PREFERRED_MQTT_BROKER']); //.then(listServers, (err) => console.log(err))


/////////////////////////
// Start Thorium Client//
///////////////////////
const ThoriumClient = require("./thoriumClient");
const gqlQueries = require("./GraphQL Queries");

ThoriumClient.findServers().then(listServers, (err) => logger.error(err))

let thoriumConnectionTimeoutTriesCount = 0;

function listServers(servers) {
  logger.info(`Found ${servers.length} bonjour/service servers`);
  //If preferred server is in the list of servers, then connect to it
  let preferredServer = servers.filter(server => server.name === process.env['PREFERRED_THORIUM_SERVER'])
  if (preferredServer.length === 1) {
    thoriumConnectionTimeoutTriesCount = 0;
    connectToServer(preferredServer);
  } else {
    if (thoriumConnectionTimeoutTriesCount < 5) {
      thoriumConnectionTimeoutTriesCount++;
      logger.warn(`Preferred server not found (try ${thoriumConnectionTimeoutTriesCount}). Retrying...`);
      setTimeout(() => {
        ThoriumClient.findServers().then(listServers, (err) => logger.error(err))
      }, 1000);
    } else {
      logger.error("Unable to find preferred server.  Here is what I was able to see...");
      logger.error(JSON.stringify(servers, null, 2));
    }
  }
}

function connectToServer(server) {
  logger.info(`Connecting to Thorium server ${server[0].endpoint}`);
  ThoriumClient.connectToServer(server[0].endpoint, server[0].subscription, process.env['STATION_NAME'], clientUpdate)
}

let subscriptionList = []

function connectSubscriptions() {
  // subscribe to all the things we need
  subscriptionList.push(ThoriumClient.subscribe(gqlQueries.reactorSubscription, { "simulator": clientStatus.simulator.id }, reactorUpdate))
  subscriptionList.push(ThoriumClient.subscribe(gqlQueries.flightSubscription, { "flight": clientStatus.flight.id }, flightUpdate))
  subscriptionList.push(ThoriumClient.subscribe(gqlQueries.simulatorSubscription, { "simulator": clientStatus.simulator.id }, simulatorUpdate))
  subscriptionList.push(ThoriumClient.subscribe(gqlQueries.systemsSubscription, { "simulator": clientStatus.simulator.id }, systemsUpdate))
  subscriptionList.push(ThoriumClient.subscribe(gqlQueries.stealthSubscription, { "simulator": clientStatus.simulator.id }, stealthUpdate))
  subscriptionList.push(ThoriumClient.subscribe(gqlQueries.softwarePanelsSubscription, { simulatorId: clientStatus.simulator.id }, softwarePanelsUpdate));
  subscriptionList.push(ThoriumClient.subscribe(gqlQueries.notifySubscription, { simulatorId: clientStatus.simulator.id, station: process.env['STATION_NAME'] }, notifyUpdate));

  setupMacroListener(clientStatus.simulator.id);
}

var clientStatus = { simulator: { id: '' }, flight: { id: '' } }

function clientUpdate(data) {
  data = data.clientChanged[0];
  const oldStatus = clientStatus ? { ...clientStatus } : {};
  clientStatus = { ...data };

  // Handle simulator connection logic
  if (!data.connected) {
    ThoriumClient.disconnect();
    return;
  } else if (oldStatus.simulator && !clientStatus.simulator) {
    subscriptionList = ThoriumClient.cancelSubscriptions(subscriptionList);
  } else if (!oldStatus.simulator && clientStatus.simulator) {
    connectSubscriptions();
  } else if (oldStatus.simulator && clientStatus.simulator && clientStatus.simulator.id !== oldStatus.simulator.id) {
    subscriptionList = ThoriumClient.cancelSubscriptions(subscriptionList);
    connectSubscriptions();
  }

  // Publish only changed fields
  const publishTopicBase = `${process.env['BASE_MQTT_STRING']}station/${data.id}/`;
  const fields = ['connected', 'cracked', 'offlineState', 'training'];

  fields.forEach((field) => {
    const oldVal = oldStatus[field];
    const newVal = data[field];

    // Only publish if changed
    if (oldVal !== newVal) {
      const payload = newVal === null ? "" : newVal.toString();
      MqttClient.publishToTopic(publishTopicBase + field, payload);
      logger.info(`Published ${field} update for station ${data.id}: ${payload}`);
    }
  });
}


//
// Keep last-known maps keyed by id (so comparisons are cheap)
//
const systemsById = new Map();
const reactorsById = new Map();
const simulatorsById = new Map();
const flightsById = new Map();
const stealthById = new Map();
const panelsById = new Map();
const triggersById = new Map();
const notificationsById = new Map();

let lastFlight = null;
let lastSimulator = null;
let lastStealth = null;
let lastPanels = null;

function shallowPick(obj, keys) {
  const out = {};
  keys.forEach(k => {
    out[k] = obj && obj[k] !== undefined ? obj[k] : null;
  })
  return out;
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (String(a[k]) !== String(b[k])) return false;
  }
  return true;
}

function reactorUpdate(data) {
  data.reactorUpdate.forEach((reactor) => {
    const id = reactor.id;
    const topicBase = `${process.env['BASE_MQTT_STRING']}system/${reactor.name}/`;

    const fields = {
      status: reactor.ejected
        ? "ejected"
        : reactor.damage?.destroyed
          ? "destroyed"
          : reactor.damage?.damaged
            ? "damaged"
            : "online",
      depletion: reactor.depletion,
      displayName: reactor.upgraded ? reactor.upgradeName : reactor.displayName,
      efficiency: reactor.efficiency,
      externalPower: reactor.externalPower,
      powerOutput: reactor.powerOutput,
      upgraded: reactor.upgraded,
      heat: reactor.heat,
      heatRate: reactor.heatRate
    };

    publishDeltas(reactorsById, id, topicBase, fields);

    // Efficiency write subscription
    const efficiencyTopic = topicBase + "setEfficiency";
    if (!(efficiencyTopic in mqttSubscribedTopics)) {
      mqttSubscribedTopics[efficiencyTopic] = fields.efficiency?.toString() ?? "";
      MqttClient.subscribeToTopic(efficiencyTopic, (dataStr) => {
        if (mqttSubscribedTopics[efficiencyTopic] != dataStr) {
          logger.info(`MQTT -> Thorium: setReactorEfficiency for ${id} -> ${dataStr}`);
          ThoriumClient.mutate(gqlQueries.setReactorEfficiency, {
            reactorId: id,
            efficiency: parseFloat(dataStr)
          });
        }
      });
    } else {
      mqttSubscribedTopics[efficiencyTopic] = fields.efficiency?.toString() ?? "";
    }
  });
}

function flightUpdate(data) {
  data.flightsUpdate.forEach((flight) => {
    const id = flight.id;
    const topicBase = `${process.env['BASE_MQTT_STRING']}flight/${flight.name}/`;

    const fields = {
      running: flight.running,
      name: flight.name
    };

    publishDeltas(flightsById, id, topicBase, fields);
  });
}


function simulatorUpdate(data) {
  data.simulatorsUpdate.forEach((sim) => {
    const id = sim.id;
    const topicBase = `${process.env['BASE_MQTT_STRING']}simulator/${sim.name}/`;

    const fields = {
      alertLevel: sim.alertlevel,
      name: sim.name,
      timelineStep: sim.currentTimelineStep,

      airlock: sim.ship.airlock,
      bridgeCrew: sim.ship.bridgeCrew,
      clamps: sim.ship.clamps,
      extraPeople: sim.ship.extraPeople,
      legs: sim.ship.legs,
      radiation: sim.ship.radiation,
      ramps: sim.ship.ramps,
      selfDestructAuto: sim.ship.selfDestructAuto,
      selfDestructTime: sim.ship.selfDestructTime,
      selfDestructCode: sim.ship.selfDestructCode,

      lightingAction: sim.lighting.action,
      lightingActionStrength: sim.lighting.actionStrength,
      lightingColor: sim.lighting.color,
      lightingIntensity: sim.lighting.intensity,
      lightingTransitionDuration: sim.lighting.transitionDuration
    };

    // console.log(fields)

    publishDeltas(simulatorsById, id, topicBase, fields);
  });
}


function systemsUpdate(data) {
  data.systemsUpdate.forEach((system) => {
    const id = system.id;
    const topicBase = `${process.env['BASE_MQTT_STRING']}system/${system.name}/`;

    const fields = {
      status: system.damage?.destroyed
        ? "destroyed"
        : system.damage?.damaged
          ? "damaged"
          : "online",
      displayName: system.upgraded ? system.upgradeName : system.displayName,
      heat: system.heat,
      power: system.power?.power,
      powerLevels: system.power?.powerLevels,
      upgraded: system.upgraded
    };

    publishDeltas(systemsById, id, topicBase, fields);

    // Thorium write subscriptions for heat and power
    ["heat", "power"].forEach((key) => {
      const topic = topicBase + "set" + key;
      if (!(topic in mqttSubscribedTopics)) {
        mqttSubscribedTopics[topic] = fields[key]?.toString() ?? "";
        MqttClient.subscribeToTopic(topic, (dataStr) => {
          if (mqttSubscribedTopics[topic] != dataStr) {
            logger.info(`MQTT -> Thorium: setSystem${key} for ${id} -> ${dataStr}`);
            ThoriumClient.mutate(
              key === "heat" ? gqlQueries.setSystemHeat : gqlQueries.setSystemPower,
              { systemId: id, [key]: parseFloat(dataStr) }
            );
          }
        });
      } else {
        mqttSubscribedTopics[topic] = fields[key]?.toString() ?? "";
      }
    });
  });
}


function stealthUpdate(data) {
  data.stealthFieldUpdate.forEach((stealth) => {
    const id = stealth.id;
    const topicBase = `${process.env['BASE_MQTT_STRING']}system/${stealth.displayName}/`;

    const fields = {
      changeAlert: stealth.changeAlert,
      activated: stealth.activated,
      charge: stealth.charge,
      upgraded: stealth.upgraded,
      state: stealth.state
    };

    publishDeltas(stealthById, id, topicBase, fields);
  });
}

function softwarePanelsUpdate(data) {
  const panels = data.softwarePanelsUpdate;
  panels.forEach(panel => {
    const id = panel.id;
    const topicBase = `${process.env['BASE_MQTT_STRING']}softwarePanel/${panel.name}/`;

    const fields = {
      name: panel.name,
      cables: JSON.stringify(panel.cables),
      connections: JSON.stringify(panel.connections),
      components: JSON.stringify(panel.components)
    };

    publishDeltas(panelsById, id, topicBase, fields);
  });
}

function notifyUpdate(data) {
  // console.log(data.notify)
  const notification = data.notify;
  const id = notification.id;
  const topicBase = `${process.env['BASE_MQTT_STRING']}notification/`;

  const fields = {
    title: notification.body
  };

  publishDeltas(notificationsById, id, topicBase, fields);
}



/// Health check: publish all known states periodically so MQTT consumers always get a snapshot
const HEALTH_CHECK_INTERVAL_MS = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000');

function publishHealthCheck() {
  try {
    // Publish simulator and flight
    if (lastSimulator) {
      MqttClient.publishToTopic(`${process.env['BASE_MQTT_STRING']}health/simulator`, JSON.stringify(lastSimulator));
    }
    if (lastFlight) {
      MqttClient.publishToTopic(`${process.env['BASE_MQTT_STRING']}health/flight`, JSON.stringify(lastFlight));
    }
    // Publish systems and reactors as arrays
    const systemsArray = Array.from(systemsById.entries()).map(([id, val]) => ({ id, ...val }));
    const reactorsArray = Array.from(reactorsById.entries()).map(([id, val]) => ({ id, ...val }));
    MqttClient.publishToTopic(`${process.env['BASE_MQTT_STRING']}health/systems`, JSON.stringify(systemsArray));
    MqttClient.publishToTopic(`${process.env['BASE_MQTT_STRING']}health/reactors`, JSON.stringify(reactorsArray));
    if (lastPanels) MqttClient.publishToTopic(`${process.env['BASE_MQTT_STRING']}health/panels`, JSON.stringify(lastPanels));    logger.debug('Health check published');
  } catch (err) {
    logger.error("Error publishing health check: " + err);
  }
}

// setInterval(publishHealthCheck, HEALTH_CHECK_INTERVAL_MS);

logger.info("Main process started.");




/**
 * Publishes only the fields that changed compared to the last known state.
 * @param {Map} storeMap - The cache of last known states by ID
 * @param {string} id - The unique object ID
 * @param {string} topicBase - The MQTT topic base string
 * @param {Object} newObj - The latest fields from Thorium
 */
function publishDeltas(storeMap, id, topicBase, newObj) {
  let prev = storeMap.get(id) || {};
  let changed = false;

  Object.entries(newObj).forEach(([key, newVal]) => {
    const oldVal = prev[key];
    if (String(newVal) !== String(oldVal)) {
      const mqttVal = newVal === null || newVal === undefined ? "" : String(newVal);
      MqttClient.publishToTopic(`${topicBase}${key}`, mqttVal);
      prev[key] = newVal;
      changed = true;
    }
  });

  if (changed) storeMap.set(id, prev);
}


const macroCache = new Map(); // key = simulatorId, value = { name -> id }

async function setupMacroListener(simulatorId) {
  logger.info("Establishing Macro Listeners");

  try {
    // Get all macros for this simulator
    const result = await ThoriumClient.query(gqlQueries.macrosQuery);
    const macros = result.data?.macros || [];

    if (macros.length === 0) {
      logger.warn(`No macros found`);
      return;
    }

    // Build cache for later lookups
    const cacheObj = {};
    macros.forEach(m => { cacheObj[m.name] = m.id; });
    macroCache.set(simulatorId, cacheObj);

    // Subscribe to an MQTT topic for each macro
    macros.forEach(macro => {
      const topic = `${process.env['BASE_MQTT_STRING']}triggerMacro/${macro.name}`;

      MqttClient.subscribeToTopic(topic, async (topic, message) => {
        try {
          logger.info(`Triggering macro "${macro.name}" (${macro.id})`);
          await ThoriumClient.mutate(gqlQueries.triggerMacroAction, {
            simulatorId,
            macroId: macro.id,
          });
        } catch (err) {
          logger.error(`Failed to trigger macro "${macro.name}" (${macro.id}):`, err);
        }
      });

      logger.info(`Subscribed to macro topic: ${topic}`);
    });
  } catch (err) {
    logger.error(`Failed to set up macro listener for simulator ${simulatorId}:`, err);
  }
}




