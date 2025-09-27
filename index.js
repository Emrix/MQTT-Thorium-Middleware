
require('dotenv').config();
// }
console.log("UTC Time:", new Date())


//////////////////////
//Start MQTT Client//
////////////////////
const MqttClient = require("./mqttClient");
let mqttSubscribedTopics = {};

MqttClient.connect(process.env['PREFERRED_MQTT_BROKER']) //.then(listServers, (err) => console.log(err))



/////////////////////////
//Start Thorium Client//
///////////////////////
const ThoriumClient = require("./thoriumClient");
const gqlQueries = require("./GraphQL Queries");

ThoriumClient.findServers().then(listServers, (err) => console.log(err))

thoriumConnectionTimeoutTriesCount = 0;

function listServers(servers) {
    //If preferred server is in the list of servers, then connect to it
    //Otherwise put something out there that says that it didn't work, and if they'd like to select a new one
    let preferredServer = servers.filter(server => server.name == process.env['PREFERRED_THORIUM_SERVER'])
    if (preferredServer.length == 1) {
        // ThoriumClient.connectToServer(preferredServer[0].endpoint, preferredServer[0].subscription, process.env['STATION_NAME'], clientUpdate)
        connectToServer(preferredServer)
        thoriumConnectionTimeoutTriesCount = 0; // reset after success
    } else {
        if (thoriumConnectionTimeoutTriesCount < 5) {
            thoriumConnectionTimeoutTriesCount++;
            setTimeout(() => {
                ThoriumClient.findServers().then(listServers, (err) => console.log(err))
            }, 1000)
            // restartThoriumClient()
        } else {
            console.log("Unabled to find preferred server.  Here is what I was able to see...")
            console.log(servers)
            //Otherwise we need to prompt for it in the UI
            // UI.updateThoriumServers(servers)
        }
    }
}

function connectToServer(server) {
    ThoriumClient.connectToServer(server[0].endpoint, server[0].subscription, process.env['STATION_NAME'], clientUpdate)
}

var subscriptionList = []

function connectSubscriptions() {
    subscriptionList.push(ThoriumClient.subscribe(gqlQueries.reactorSubscription, { "simulator": clientStatus.simulator.id }, reactorUpdate))
    subscriptionList.push(ThoriumClient.subscribe(gqlQueries.flightSubscription, { "flight": clientStatus.flight.id }, flightUpdate))
    subscriptionList.push(ThoriumClient.subscribe(gqlQueries.simulatorSubscription, { "simulator": clientStatus.simulator.id }, simulatorUpdate))
    subscriptionList.push(ThoriumClient.subscribe(gqlQueries.systemsSubscription, { "simulator": clientStatus.simulator.id }, systemsUpdate))
    // subscriptionList.push(ThoriumClient.subscribe(gqlQueries.stealthSubscription, { "simulator": clientStatus.simulator.id }, stealthUpdate))
}

var clientStatus = { simulator: { id: '' } }

function clientUpdate(data) {
    data = data.clientChanged[0]
    let oldStatus = JSON.parse(JSON.stringify(clientStatus))
    clientStatus = JSON.parse(JSON.stringify(data))
    if (!data.connected) { //We are no longer connected
        ThoriumClient.disconnect();
        return
    } else if (oldStatus.simulator && !clientStatus.simulator) { //If we were connected and are no longer connected to a simulator
        subscriptionList = ThoriumClient.cancelSubscriptions(subscriptionList)
    } else if (!oldStatus.simulator && clientStatus.simulator) { //If we weren't connected to a simulator and now we are...
        connectSubscriptions()
    } else if (oldStatus.simulator && clientStatus.simulator && clientStatus.simulator.id != oldStatus.simulator.id) { //if were were connected to a simulator before, but it changed...
        subscriptionList = ThoriumClient.cancelSubscriptions(subscriptionList)
        connectSubscriptions()
    }

    //Publish everything to MQTT
    let publishTopicBase = `${process.env['BASE_MQTT_STRING']}station/${data.id}/`
    MqttClient.publishToTopic(publishTopicBase + "connected", data.connected === null ? "" : data.connected.toString());
    MqttClient.publishToTopic(publishTopicBase + "cracked", data.cracked === null ? "" : data.cracked.toString());
    MqttClient.publishToTopic(publishTopicBase + "offlineState", data.offlineState === null ? "" : data.offlineState);
    MqttClient.publishToTopic(publishTopicBase + "training", data.training === null ? "" : data.training.toString());
}

var reactorStatus = {}

function reactorUpdate(data) {
    if (JSON.stringify(reactorStatus) != JSON.stringify(data)) {
        reactorStatus = JSON.parse(JSON.stringify(data))
        data.reactorUpdate.forEach((reactor) => {
            let publishTopicBase = `${process.env['BASE_MQTT_STRING']}system/${reactor.name}/`
            if (reactor.ejected) {
                MqttClient.publishToTopic(publishTopicBase + "status", "ejected");
            } else if (reactor.damage.destroyed) {
                MqttClient.publishToTopic(publishTopicBase + "status", "destroyed");
            } else if (reactor.damage.damaged) {
                MqttClient.publishToTopic(publishTopicBase + "status", "damaged");
            } else {
                MqttClient.publishToTopic(publishTopicBase + "status", "online");
            }
            MqttClient.publishToTopic(publishTopicBase + "depletion", reactor.depletion === null ? "" : reactor.depletion.toString());
            if (reactor.upgraded) {
                MqttClient.publishToTopic(publishTopicBase + "displayName", reactor.upgradeName === null ? "" : reactor.upgradeName.toString());
            } else {
                MqttClient.publishToTopic(publishTopicBase + "displayName", reactor.displayName === null ? "" : reactor.displayName.toString());
            }
            MqttClient.publishToTopic(publishTopicBase + "efficiency", reactor.efficiency === null ? "" : reactor.efficiency.toString());
            MqttClient.publishToTopic(publishTopicBase + "externalPower", reactor.externalPower === null ? "" : reactor.externalPower.toString());
            MqttClient.publishToTopic(publishTopicBase + "powerOutput", reactor.powerOutput === null ? "" : reactor.powerOutput.toString());
            MqttClient.publishToTopic(publishTopicBase + "upgraded", reactor.upgraded === null ? "" : reactor.upgraded.toString());

            //Reactor Heat (publish and response)
            let publishTopic = publishTopicBase + "heat";
            let publishValue = reactor.heat === null ? "" : reactor.heat.toString()
            MqttClient.publishToTopic(publishTopic, publishValue);
            if (publishTopic in mqttSubscribedTopics) {
                mqttSubscribedTopics[publishTopic] = publishValue
            } else {
                mqttSubscribedTopics[publishTopic] = publishValue
                MqttClient.subscribeToTopic(publishTopic,(data) => {
                    if (mqttSubscribedTopics[publishTopic] != data) {
                        ThoriumClient.mutate(gqlQueries.setReactorHeat, { "reactorId": reactor.id, "heat": data })
                    }
                })
            }
        })
    }
}

var flightStatus = {}

function flightUpdate(data) {
    if (JSON.stringify(flightStatus) != JSON.stringify(data)) {
        flightStatus = JSON.parse(JSON.stringify(data)).flightsUpdate[0]
        let publishTopicBase = `${process.env['BASE_MQTT_STRING']}flight/`
        // console.log(flightStatus)
        // MqttClient.publishToTopic(publishTopicBase + "running", (!flightStatus.running || flightStatus.running === null) ? "" : flightStatus.running.toString());
        // MqttClient.publishToTopic(publishTopicBase + "name", (!flightStatus.name || flightStatus.name === null) ? "" : flightStatus.name.toString());
        // MqttClient.publishToTopic(publishTopicBase + "timelineStep", (!flightStatus.timelineStep || flightStatus.timelineStep === null) ? "" : flightStatus.timelineStep.toString());
    }
}

var simulatorStatus = {}

function simulatorUpdate(data) {
    if (JSON.stringify(simulatorStatus) != JSON.stringify(data)) {
        simulatorStatus = JSON.parse(JSON.stringify(data)).simulatorsUpdate[0]
        // console.log(simulatorStatus)
        let publishTopicBase = `${process.env['BASE_MQTT_STRING']}simulator/`
        MqttClient.publishToTopic(publishTopicBase + "alertlevel", simulatorStatus.alertlevel === null ? "" : simulatorStatus.alertlevel.toString());
        MqttClient.publishToTopic(publishTopicBase + "name", simulatorStatus.name === null ? "" : simulatorStatus.name.toString());
        MqttClient.publishToTopic(publishTopicBase + "panels", simulatorStatus.panels === null ? "" : simulatorStatus.panels.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/airlock", simulatorStatus.ship.airlock === null ? "" : simulatorStatus.ship.airlock.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/bridgeCrew", simulatorStatus.ship.bridgeCrew === null ? "" : simulatorStatus.ship.bridgeCrew.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/clamps", simulatorStatus.ship.clamps === null ? "" : simulatorStatus.ship.clamps.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/extraPeople", simulatorStatus.ship.extraPeople === null ? "" : simulatorStatus.ship.extraPeople.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/legs", simulatorStatus.ship.legs === null ? "" : simulatorStatus.ship.legs.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/radiation", simulatorStatus.ship.radiation === null ? "" : simulatorStatus.ship.radiation.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/ramps", simulatorStatus.ship.ramps === null ? "" : simulatorStatus.ship.ramps.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/selfDestructAuto", simulatorStatus.ship.selfDestructAuto === null ? "" : simulatorStatus.ship.selfDestructAuto.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/selfDestructTime", simulatorStatus.ship.selfDestructTime === null ? "" : simulatorStatus.ship.selfDestructTime.toString());
        MqttClient.publishToTopic(publishTopicBase + "ship/velocity", simulatorStatus.ship.velocity === null ? "" : simulatorStatus.ship.velocity.toString());
        MqttClient.publishToTopic(publishTopicBase + "lighting/action", simulatorStatus.lighting.action === null ? "" : simulatorStatus.lighting.action.toString());
        MqttClient.publishToTopic(publishTopicBase + "lighting/actionStrength", simulatorStatus.lighting.actionStrength === null ? "" : simulatorStatus.lighting.actionStrength.toString());
        MqttClient.publishToTopic(publishTopicBase + "lighting/color", simulatorStatus.lighting.color === null ? "" : simulatorStatus.lighting.color.toString());
        MqttClient.publishToTopic(publishTopicBase + "lighting/intensity", simulatorStatus.lighting.intensity === null ? "" : simulatorStatus.lighting.intensity.toString());
        MqttClient.publishToTopic(publishTopicBase + "lighting/transitionDuration", simulatorStatus.lighting.transitionDuration === null ? "" : simulatorStatus.lighting.transitionDuration.toString());
    }
}

var systemsStatus = {}

function systemsUpdate(data) { //Thorium to App Connections
    if (JSON.stringify(systemsStatus) != JSON.stringify(data)) {
        systemsStatus = JSON.parse(JSON.stringify(data))
        // console.log(data);
        data.systemsUpdate.forEach((system) => {
            let publishTopicBase = `${process.env['BASE_MQTT_STRING']}system/${system.name}/`
            MqttClient.publishToTopic(publishTopicBase + "upgraded", system.upgraded === null ? "" : system.upgraded.toString());
            MqttClient.publishToTopic(publishTopicBase + "type", system.type === null ? "" : system.type.toString());
            // MqttClient.publishToTopic(publishTopicBase + "upgradeName", system.upgradeName === null ? "" : system.upgradeName.toString());
            if (system.ejected) {
                MqttClient.publishToTopic(publishTopicBase + "status", "ejected");
            } else if (system.damage.destroyed) {
                MqttClient.publishToTopic(publishTopicBase + "status", "destroyed");
            } else if (system.damage.damaged) {
                MqttClient.publishToTopic(publishTopicBase + "status", "damaged");
            } else {
                MqttClient.publishToTopic(publishTopicBase + "status", "online");
            }
            if (system.upgraded) {
                MqttClient.publishToTopic(publishTopicBase + "displayName", system.upgradeName === null ? "" : system.upgradeName.toString());
            } else {
                MqttClient.publishToTopic(publishTopicBase + "displayName", system.displayName === null ? "" : system.displayName.toString());
            }
            
            // console.log(system)
            // MqttClient.publishToTopic(publishTopicBase + "damage/damaged", system.damage.damaged === null ? "" : system.damage.damaged.toString());
            // MqttClient.publishToTopic(publishTopicBase + "damage/destroyed", system.damage.destroyed === null ? "" : system.damage.destroyed.toString());
            // MqttClient.publishToTopic(publishTopicBase + "displayName", system.displayName === null ? "" : system.displayName.toString());
            MqttClient.publishToTopic(publishTopicBase + "heat", system.heat === null ? "" : system.heat.toString());
            MqttClient.publishToTopic(publishTopicBase + "extra", system.extra === null ? "" : system.extra.toString());
            if (system.power !== null) {
                MqttClient.publishToTopic(publishTopicBase + "power/powerLevels", system.power.powerLevels === null ? "" : system.power.powerLevels.toString());

                //System Power (publish and response)
                let publishTopic = publishTopicBase + "power/power";
                let publishValue = system.power.power === null ? "" : system.power.power.toString()
                MqttClient.publishToTopic(publishTopic, publishValue);
                if (publishTopic in mqttSubscribedTopics) {
                    mqttSubscribedTopics[publishTopic] = publishValue
                } else {
                    mqttSubscribedTopics[publishTopic] = publishValue
                    MqttClient.subscribeToTopic(publishTopic,(data) => {
                        if (mqttSubscribedTopics[publishTopic] != data) {
                            ThoriumClient.mutate(gqlQueries.setSystemPower, { "systemId": system.id, "power": data })
                        }
                    })
                }

            }
        })
    }
}

var stealthStatus = {}


function stealthUpdate(data) {
    if (JSON.stringify(stealthStatus) != JSON.stringify(data)) {
        stealthStatus = JSON.parse(JSON.stringify(data)).stealthFieldUpdate[0];
        let publishTopicBase = `${process.env['BASE_MQTT_STRING']}system/${stealthStatus.displayName}/`;
        MqttClient.publishToTopic(publishTopicBase + "changeAlert", stealthStatus.changeAlert === null ? "" : stealthStatus.changeAlert.toString());
        MqttClient.publishToTopic(publishTopicBase + "activated", stealthStatus.activated === null ? "" : stealthStatus.activated.toString());
        MqttClient.publishToTopic(publishTopicBase + "charge", stealthStatus.charge === null ? "" : stealthStatus.charge.toString());
        MqttClient.publishToTopic(publishTopicBase + "damage/damaged", stealthStatus.damage.damaged === null ? "" : stealthStatus.damage.damaged.toString());
        MqttClient.publishToTopic(publishTopicBase + "damage/destroyed", stealthStatus.damage.destroyed === null ? "" : stealthStatus.damage.destroyed.toString());
        MqttClient.publishToTopic(publishTopicBase + "displayName", stealthStatus.displayName === null ? "" : stealthStatus.displayName.toString());
        MqttClient.publishToTopic(publishTopicBase + "extra", stealthStatus.extra === null ? "" : stealthStatus.extra.toString());
        MqttClient.publishToTopic(publishTopicBase + "power/power", stealthStatus.power.power === null ? "" : stealthStatus.power.power.toString());
        MqttClient.publishToTopic(publishTopicBase + "power/powerLevels", stealthStatus.power.powerLevels === null ? "" : stealthStatus.power.powerLevels.toString());
        MqttClient.publishToTopic(publishTopicBase + "upgraded", stealthStatus.upgraded === null ? "" : stealthStatus.upgraded.toString());
        MqttClient.publishToTopic(publishTopicBase + "type", stealthStatus.type === null ? "" : stealthStatus.type.toString());
        MqttClient.publishToTopic(publishTopicBase + "upgradeName", stealthStatus.upgradeName === null ? "" : stealthStatus.upgradeName.toString());
        MqttClient.publishToTopic(publishTopicBase + "state", stealthStatus.state === null ? "" : stealthStatus.state.toString());
    }
}

let disconnectThoriumClient = function() {
    ThoriumClient.disconnect("PHX IoT")
}

let restartThoriumClient = function() {
    try {
        ThoriumClient.disconnect()
    } catch (vError) {

    }

    subscriptionList = []
    mqttSubscribedTopics = {}

    clientStatus = { simulator: { id: '' } }
    reactorStatus = {}
    flightStatus = {}
    simulatorStatus = {}
    systemsStatus = {}
    stealthStatus = {}
    
    MqttClient.resetHandlers();
    ThoriumClient.findServers().then(listServers, (err) => console.log(err))
}