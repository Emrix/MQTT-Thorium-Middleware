const gqlQueries = require("../GraphQL Queries");
const logger = require('../logger');

exports.findServers = () => {
  logger.info(`Searching for Thorium Servers`);
  const bonjour = require("bonjour")();

  return new Promise(resolve => {
    const servers = [];
    bonjour.find({ type: "http" }, newService);
    setTimeout(() => { resolve(servers) }, 1000); // return after 1 second

    // While this code could be adapted to connect to multiple Thorium servers
    // we'll use it to connect to the first one.
    function newService(service) {
      if (!service) return;
      if (service.name && (service.name.indexOf("Thorium") > -1 || service.type === "local")) {
        const isHttps = service.txt && service.txt.https === "true";
        const ipregex = /[0-2]?[0-9]{1,2}\.[0-2]?[0-9]{1,2}\.[0-2]?[0-9]{1,2}\.[0-2]?[0-9]{1,2}/gi;
        const address = service.addresses && service.addresses.find(a => ipregex.test(a));
        if (!address) return;
        const endpoint = `${printUrl(address, !isHttps, service.port)}/`;
        const subscription = `${printWs(address, !isHttps, service.port)}/`;
        servers.push({
          name: service.host || service.name,
          endpoint: endpoint,
          subscription: subscription,
        });
      }
    }

    function printUrl(address, httpOnly, port) {
      return `http${httpOnly ? "" : "s"}://${address}${(port === 443 && !httpOnly) || (port === 80 && httpOnly) ? "" : `:${port}`}`;
    }

    function printWs(address, httpOnly, port) {
      return `ws${httpOnly ? "" : "s"}://${address}${(port === 443 && !httpOnly) || (port === 80 && httpOnly) ? "" : `:${port}`}`;
    }
  });
}

var client;
var clientName;
var clientWS;

exports.connectToServer = (serverURI, subscriptionURI, _clientName, clientUpdateCallback) => {
  if (clientName != undefined) {
    this.disconnect();
  }

  clientName = _clientName;
  if (serverURI.charAt(serverURI.length - 1) == "/") {
    serverURI = serverURI += "graphql"
  } else {
    serverURI = serverURI += "/graphql"
  }
  const { createClient } = require('@urql/core');
  client = createClient({
    url: serverURI,
  });

  const mutation_params = {
    "clientName": _clientName,
    "mobile": true,
    "cards": ["IOT"]
  }

  // Register client
  this.mutate(gqlQueries.registerClient, mutation_params)


  ////Setting Up Subscriptions\\\\
  var ws = require('ws')
  var ApolloClient = require('apollo-boost').ApolloClient;
  var WebSocketLink = require('apollo-link-ws').WebSocketLink;
  var InMemoryCache = require('apollo-cache-inmemory').InMemoryCache;
  var gql = require('graphql-tag');

  // convert http -> ws
  const wsUri = serverURI.replace(/^http/, 'ws');

  var link = new WebSocketLink({
    uri: wsUri,
    options: { reconnect: true },
    webSocketImpl: ws
  })

  // Access subscription client safely
  link.subscriptionClient.onConnected(() => { logger.info('Subscription socket connected'); })
  link.subscriptionClient.onDisconnected(() => { logger.warn('Subscription socket disconnected'); })
  link.subscriptionClient.onError(err => {
    logger.error("connection error: " + (err && err.message ? err.message : err));
  })

  clientWS = new ApolloClient({ link, cache: new InMemoryCache() })

  const subscription_params = {
    "clientName": _clientName,
    "mobile": true,
    "cards": ["Panels"]
  }
  this.subscribe(gqlQueries.clientSubscription, subscription_params, clientUpdateCallback)
}

exports.disconnect = () => {
  if (!client || !clientName) return;
  const QUERY = `
mutation removeClient {
  clientDisconnect(client: "${clientName}")
}
`
  client.mutation(QUERY)
    .toPromise()
    .then(result => {
      logger.info('Client disconnect mutation submitted');
    }).catch(err => logger.warn('Error during client disconnect mutation: ' + err));

  clientName = undefined
  currentSubscriptionsList = this.cancelSubscriptions(currentSubscriptionsList)
}

exports.cancelSubscriptions = (subscriptionsList) => {
  // unsubscribe if available
  subscriptionsList.forEach((subscription) => {
    try {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      } else if (subscription && subscription._cleanup && subscription._cleanup._cleanup) {
        // fallback for older apollo internals (still brittle)
        subscription._cleanup._cleanup();
      }
    } catch (err) {
      logger.warn("Error cancelling subscription: " + err);
    }
  })
  return []
}

exports.query = (QUERY, params) => {
  return client.query(QUERY, params).toPromise();
}

exports.mutate = (QUERY, params) => {
  console.log(QUERY, params)
  try {
    return client.mutation(QUERY, params)
      .toPromise()
      .then(result => {
        // optional success handling
        return result;
      }).catch(err => {
        logger.error("GraphQL mutate error: " + err);
      });
  } catch (err) {
    logger.error("GraphQL mutate exception: " + err);
  }
}


let currentSubscriptionsList = []

exports.subscribe = (QUERY, params, callback) => {
  var gql = require('graphql-tag')
  let newSubscription = clientWS.subscribe({
    fetchPolicy: 'network-only',
    query: gql `${QUERY}`,
    variables: params
  }).subscribe({
    next(payload) {
      try {
        callback(payload.data)
      } catch (err) {
        logger.error("Error in subscription callback: " + err);
      }
    },
    error(err) {
      logger.warn("Subscription error: " + err);
    }
  })
  currentSubscriptionsList.push(newSubscription)
  return newSubscription
}
