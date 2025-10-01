// Import required modules
const mqtt = require('mqtt');
const logger = require('../logger');

let mqttClient = null;  // Internal variable to store the MQTT client

// A registry to store handlers per topic
let messageHandlers = {};

// Connect to the MQTT broker
exports.connect = (_brokerUrl) => {
  logger.info(`Connecting to MQTT Broker`);
  if (!mqttClient) {
    if (!_brokerUrl) {
      logger.error("No MQTT broker provided in PREFERRED_MQTT_BROKER env var");
      return;
    }
    _brokerUrl = _brokerUrl.replace(/^mqtt:\/\//, '');
    _brokerUrl = "mqtt://" + _brokerUrl;
    const options = {
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000,
      // other options (username/password) can be included via env or config
    };
    mqttClient = mqtt.connect(_brokerUrl, options);

    mqttClient.setMaxListeners(50);

    mqttClient.on('connect', () => {
      logger.info(`Connected to MQTT broker: ${_brokerUrl}`);
    });

    mqttClient.on('reconnect', () => {
      logger.warn('Reconnecting to MQTT broker...');
    });

    mqttClient.on('error', (error) => {
      logger.error('Connection error: ' + error);
      // keep client alive, mqtt will attempt reconnects
    });

    mqttClient.on('close', () => {
      logger.warn('Disconnected from MQTT broker');
    });

    mqttClient.on('message', (topic, message) => {
      const handler = messageHandlers[topic];
      if (handler) {
        try {
          handler(message.toString());
        } catch (err) {
          logger.error(`Error in message handler for ${topic}: ${err}`);
        }
      } else {
        logger.debug(`Received message for unhandled topic: ${topic}`);
      }
    });
  } else {
    logger.info('MQTT client already initialized');
  }
};

// Subscribe to a topic and register a handler
exports.subscribeToTopic = (topic, messageHandler) => {
  if (!mqttClient) {
    logger.error('MQTT client not initialized. Call connect() first.');
    return;
  }

  mqttClient.subscribe(topic, (err) => {
    if (err) {
      logger.error(`Failed to subscribe to topic ${topic}: ${err}`);
    } else {
      messageHandlers[topic] = messageHandler;
      logger.info(`Subscribed to topic: ${topic}`);
    }
  });
};

// Publish to a topic
exports.publishToTopic = (topic, message) => {
  if (!mqttClient) {
    logger.error('MQTT client not initialized. Call connect() first.');
    return;
  }

  mqttClient.publish(topic, message, (err) => {
    if (err) {
      logger.error(`Failed to publish message to topic ${topic}: ${err}`);
    }
  });
};

exports.resetHandlers = () => {
  messageHandlers = {}
  logger.info('MQTT handlers reset');
}
