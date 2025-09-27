// Import required modules
const mqtt = require('mqtt');
let mqttClient = null;  // Internal variable to store the MQTT client

// A registry to store handlers per topic
let messageHandlers = {};

// Connect to the MQTT broker
exports.connect = (_brokerUrl) => {
  console.log(`Connecting to MQTT Broker`);
  if (!mqttClient) {
    _brokerUrl = "mqtt://" + _brokerUrl;
    mqttClient = mqtt.connect(_brokerUrl);
    mqttClient.setMaxListeners(50);  // Optional if you're only using 1 listener

    mqttClient.on('connect', () => {
      console.log(`Connected to MQTT broker: ${_brokerUrl}`);
    });

    mqttClient.on('error', (error) => {
      console.log('Connection error: ', error);
      mqttClient.end();  // Close the connection on error
    });

    mqttClient.on('close', () => {
      console.log('Disconnected from MQTT broker');
    });

    mqttClient.on('message', (topic, message) => {
      const handler = messageHandlers[topic];
      if (handler) {
        handler(message.toString());
      } else {
        console.log(`Received message for unhandled topic: ${topic}`);
      }
    });
  } else {
    console.log('MQTT client already initialized');
  }
};

// Subscribe to a topic and register a handler
exports.subscribeToTopic = (topic, messageHandler) => {
  if (!mqttClient) {
    console.log('MQTT client not initialized. Call connect() first.');
    return;
  }

  mqttClient.subscribe(topic, (err) => {
    if (err) {
      console.log(`Failed to subscribe to topic ${topic}:`, err);
    } else {
      // console.log(`Subscribed to topic: ${topic}`);
      messageHandlers[topic] = messageHandler;  // ✅ Register handler
    }
  });
};

// Publish to a topic
exports.publishToTopic = (topic, message) => {
  if (!mqttClient) {
    console.log('MQTT client not initialized. Call connect() first.');
    return;
  }

  mqttClient.publish(topic, message, (err) => {
    if (err) {
      console.log(`Failed to publish message to topic ${topic}:`, err);
    }
  });
};

exports.resetHandlers = () => {
  messageHandlers = {}
}
