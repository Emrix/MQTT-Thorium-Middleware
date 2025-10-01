////////////////
// Mutations //
//////////////

exports.registerClient = `mutation RegisterClient($clientName: ID!, $mobile: Boolean, $cards:[String]) {
  clientConnect(client:$clientName, mobile:$mobile, cards:$cards)
}`

exports.setReactorEfficiency = `mutation ReactorEfficiency($reactorId: ID!, $efficiency: Float) {
  reactorChangeEfficiency(id: $reactorId, efficiency: $efficiency)
}`;

exports.setSystemPower = `mutation systemPowerUpdate($systemId: ID!,$power: Int!) {
  changePower(systemId: $systemId, power: $power)
}`

exports.setSystemHeat = `mutation systemHeatUpdate($systemId: ID!, $heat: Float) {
  addHeat(id: $systemId, heat: $heat)
}`;

exports.triggerMacroAction = `mutation TriggerMacro($simulatorId: ID!, $macroId: ID!) {
  triggerMacroAction(simulatorId: $simulatorId, macroId: $macroId)
}`



//////////////
// Queries //
////////////

exports.macrosQuery = `query Macros {
  macros {
    id
    name
  }
}`;




////////////////////
// Subscriptions //
//////////////////

exports.clientSubscription = `subscription IoTClientUpdate($clientName: ID!) {
  clientChanged(clientId: $clientName) {
    id
    connected
    flight {
      id
    }
    simulator {
      id
    }
    cracked
    offlineState
    training
  }
}`

exports.reactorSubscription = `subscription iotReactorUpdate($simulator: ID!) {
  reactorUpdate(simulatorId: $simulator) {
    damage {
      damaged
      destroyed
    }
    depletion
    displayName
    efficiency
    ejected
    name
    externalPower
    heat
    heatRate
    id
    powerOutput
    upgraded
    upgradeName
    simulatorId
  }
}`

exports.flightSubscription = `subscription flights($flight: ID!) {
  flightsUpdate(id: $flight) {
    id
    running
    name
    simulators {
      id
    }
  }
}`

exports.simulatorSubscription = `subscription IoTSimUpdate($simulator: ID!) {
  simulatorsUpdate(simulatorId: $simulator) {
    id
    alertlevel
    name
    panels
    currentTimelineStep
    ship {
      airlock
      bridgeCrew
      clamps
      extraPeople
      legs
      radiation
      ramps
      selfDestructAuto
      selfDestructTime
      selfDestructCode
    }
    lighting {
        action
        actionStrength
        color
        intensity
        transitionDuration
    }
  }
}`

exports.systemsSubscription = `subscription iotSystemsUpdate($simulator: ID!) {
  systemsUpdate(simulatorId: $simulator)  {
    damage {
      damaged
      destroyed
    }
    displayName
    name
    id
    power {
      power
      powerLevels
    }
    simulatorId
    upgraded
    type
    upgradeName
  }
}`

exports.stealthSubscription = `subscription iotStealthUpdate($simulator: ID!) {
  stealthFieldUpdate(simulatorId: $simulator) {
    changeAlert
    activated
    charge
    displayName
    id
    simulatorId
    upgraded
    upgradeName
    type
    state
  }
}`

exports.softwarePanelsSubscription = `subscription PanelsUpdate($simulatorId: ID) {
  softwarePanelsUpdate(simulatorId: $simulatorId) {
    id
    name
    cables {
      id
      color
      components
    }
    components {
      id
      label
      color
      component
      level
      scale
      x
      y
    }
    connections {
      id
      from
      to
    }
  }
}`

exports.notifySubscription = `subscription Notify($simulatorId: ID!, $station: String) {
  notify(simulatorId: $simulatorId, station: $station) {
    id
    body
    title
  }
}`;

