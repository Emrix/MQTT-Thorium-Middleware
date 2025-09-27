
////////////////
// Mutations //
//////////////

exports.registerClient = `mutation RegisterClient($clientName: ID!, $mobile: Boolean, $cards:[String]) {
  clientConnect(client:$clientName, mobile:$mobile, cards:$cards)
}`

exports.setReactorHeat = `mutation ReactorHeat($reactorId: ID!,$heat: Float) {
  addHeat(id: $reactorId, heat: $heat)
}`

exports.setSystemPower = `mutation systemPowerUpdate($systemId: ID!,$power: Int!) {
  changePower(systemId: $systemId, power: $power)
}`




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
    label
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
    timelineStep
  }
}`

exports.simulatorSubscription = `subscription IoTSimUpdate($simulator: ID!) {
  simulatorsUpdate(simulatorId: $simulator) {
    id
    alertlevel
    name
    panels
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
      velocity
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
    heat
    id
    extra
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
    damage {
      damaged
      destroyed
    }
    displayName
    id
    power {
      power
      powerLevels
    }
    simulatorId
    upgraded
    upgradeName
    type
    state
  }
}`
