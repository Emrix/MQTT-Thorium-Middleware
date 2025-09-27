const gqlQueries = require("../GraphQL Queries");

exports.findServers = () => {
  console.log(`Searching for Thorium Servers`);
  const bonjour = require("bonjour")();


return new Promise(resolve => {
    const servers = [];
    bonjour.find({ type: "http" }, newService);
    setTimeout(() => { resolve(servers) }, 1000); 
    // While this code could be adapted to connect to multiple Thorium servers
    // we'll use it to connect to the first one.
    function newService(service) {
      if (service.name.indexOf("Thorium") > -1 || service.type === "local") {
        const isHttps = service.txt.https === "true";
        const ipregex = /[0-2]?[0-9]{1,2}\.[0-2]?[0-9]{1,2}\.[0-2]?[0-9]{1,2}\.[0-2]?[0-9]{1,2}/gi;
        const address = service.addresses.find(a => ipregex.test(a));

        const endpoint = `${printUrl(address, !isHttps, service.port)}/`;
        const subscription = `${printWs(address, !isHttps, service.port)}/`;
        servers.push({
          name: service.host,
          endpoint: endpoint,
          subscription: subscription,
        });
      }
    }

    function printUrl(address, httpOnly, port) {
      return `http${httpOnly ? "" : "s"}://${address}${
        (port === 443 && !httpOnly) || (port === 80 && httpOnly) ? "" : `:${port}`
      }`;
    }

    function printWs(address, httpOnly, port) {
      return `ws${httpOnly ? "" : "s"}://${address}${
        (port === 443 && !httpOnly) || (port === 80 && httpOnly) ? "" : `:${port}`
      }`;
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

  //Setting up the query client
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

  //Now connect as a client.
  this.mutate(gqlQueries.registerClient, mutation_params)
  console.log(`Connected to Thorium Server: ${serverURI}`)


  ////Setting Up Subscriptions\\\\
  var ws = require('ws')
  var ApolloClient = require('apollo-boost').ApolloClient;
  var WebSocketLink = require('apollo-link-ws').WebSocketLink;
  var InMemoryCache = require('apollo-cache-inmemory').InMemoryCache;

  serverURI = serverURI.replace(/^http/, 'ws');

  var link = new WebSocketLink({
    uri: serverURI,
    options: { reconnect: true },
    webSocketImpl: ws
  })
  link.subscriptionClient.onConnected(() => {})
  link.subscriptionClient.onDisconnected(() => {})
  link.subscriptionClient.onError(err => {
    console.log("connection error: " + err.message, {})
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
  const QUERY = `
mutation removeClient {
  clientDisconnect(client: "${clientName}")
}
`
  client.mutation(QUERY)
    .toPromise()
    .then(result => {
      // console.log(result); // { data: ... }
    });
  //We might have to find a way to unsubscribe from everything here...
  clientName = undefined
  currentSubscriptionsList = this.cancelSubscriptions(currentSubscriptionsList)
}

exports.cancelSubscriptions = (subscriptionsList) => {
  // console.log("Cancelling subs",subscriptionsList)
  subscriptionsList.forEach((subscription) => {
    // subscription._cleanup._cleanup()
    subscription.unsubscribe()
  })
  for (let x = 0; x < subscriptionsList.length; x++) {
    delete subscriptionsList[x]
  }
  return []
}




exports.query = (QUERY, params) => {
  return client.query(QUERY, params).toPromise();
}

exports.mutate = (QUERY, params) => {
  client.mutation(QUERY, params)
    .toPromise()
    .then(result => {
      // console.log(result); // { data: ... }
    });
}


let currentSubscriptionsList = []

exports.subscribe = (QUERY, params, callback) => {
  // console.log(QUERY, params, callback)
  var gql = require('graphql-tag')
  let newSubscription = clientWS.subscribe({
    fetchPolicy: 'network-only',
    query: gql `${QUERY}`,
    variables: params ///??????
  }).subscribe({
    next(data) {
      callback(data.data)
    },
    error(err) {}
  })
  currentSubscriptionsList.push(newSubscription)
  return newSubscription
}