
var spinalgraph = require("spinalgraph");

var Q = require("q");
var spinalCore = require("spinal-core-connectorjs");
var forgeFile = require("spinal-lib-forgefile");
var config = require("./config");

const { SpinalNetwork } = require("spinal-models-bmsNetwork");

var TimeSeries = require("spinal-models-timeSeries").TimeSeries;

String.prototype.hashCode = function() {
  var hash = 0,
    i,
    chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr = this.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

const connect_opt = `http://${config.spinalConnector.user}:${
  config.spinalConnector.password
}@${config.spinalConnector.host}:${config.spinalConnector.port}/`;

var conn = spinalCore.connect(connect_opt);


/**
 * This function create a graph if don't exist, get it if exist and return it;
 */
let getGraph = _file => {
  return new Promise(function(resolve, reject) {
    if (_file.graph) return resolve(_file.graph);

    var _graph = new spinalgraph.SpinalGraph();

    _file.add_attr({
      graph: _graph
    });
    resolve(_graph);
  });

  return _graph;
};

/**
 * This function create a context VirtualNetwork if don't exist, get it if exist and return it;
 */
let createOrGetContext = async function(_graph) {
  return new Promise(async (resolve, reject) => {
    _graph.getContext(config.networkConnector.appName).then(async context => {
      if (typeof context !== "undefined") {
        return resolve(context);
      }

      var network = new SpinalNetwork(config.networkConnector);

      let virtualContext = new spinalgraph.SpinalContext(
        config.networkConnector.appName,
        "SpinalContext",
        network
      );

      try {
        _graph.addContext(virtualContext);
        virtualContext = await _graph.getContext(
          config.networkConnector.appName
        );
        resolve(virtualContext);
      } catch (e) {
        reject(e);
      }
    });
  });
};

let getFileAnCreateNetwork = _file => {
  getGraph(_file).then(_graph => {
    buildNetwork(_graph);
  });
};

//LoadFile
spinalCore.load(
  conn,
  config.file.path,
  _file => {
    getFileAnCreateNetwork(_file);
  },
  () => {
    var _file = new forgeFile.ForgeFileItem();

    spinalCore.store(conn, _file, config.file.path, () => {
      getFileAnCreateNetwork(_file);
    });
  }
);

let createDevices = async function(
  networkNode,
  argContainers,
  DeviceDictionary
) {
  let dictionaries = [];
  for (var i = 0; i < argContainers.length; i++) {
    let d = argContainers[i].device;

    // add device

    let deviceNode;

    if (typeof DeviceDictionary[d.path.get().hashCode()] == "undefined") {
      deviceNode = new spinalgraph.SpinalNode(d.name, "SpinalNode", d);

      networkNode.addChild(deviceNode, "hasDevice", "Ref");

      DeviceDictionary.add_attr({
        [d.path.get().hashCode()]: deviceNode
      });
    }

    deviceNode = DeviceDictionary[d.path.get().hashCode()];

    if (!deviceNode.hasRelation("hasBeenLoaded", "Ref")) {
      deviceNode.addChild(
        new Model({
          type: "SpinalDevice"
        }),
        "hasBeenLoaded",
        "Ref"
      );
    }

    var deviceChildren = await deviceNode.getChildren(["hasBeenLoaded"]);

    dictionaries.push(await deviceChildren[0].getElement());
  }
  return dictionaries;
};

let createEndpoints = async function(
  d,
  deviceNode,
  argcontainers,
  DeviceEndpointDictionary,
  EndpointDictionary,
  iterationCount
) {
  let toSubscribe = [];
  for (var j = 0; j < argcontainers[iterationCount].endpoints.length; j++) {
    let endpoint = argcontainers[iterationCount].endpoints[j];

    let hashedId = endpoint.path.get().hashCode();

    if (
      typeof DeviceEndpointDictionary[d.path.get().hashCode()][hashedId] ==
      "undefined"
    ) {
      let endpointNode = new spinalgraph.SpinalNode(
        endpoint.name.get(),
        "SpinalNode",
        endpoint
      );

      deviceNode.addChild(endpointNode, "hasEndpoint", "Ref");

      let timeSeriesNode = new spinalgraph.SpinalNode(
        "SpinalNode",
        "SpinalNode",
        new TimeSeries()
      );

      endpointNode.addChild(timeSeriesNode, "hasHistory", "Ref");

      if (typeof EndpointDictionary[hashedId] === "undefined") {
        EndpointDictionary.add_attr({
          [hashedId]: endpointNode
        });
      }

      DeviceEndpointDictionary[d.path.get().hashCode()].add_attr({
        [hashedId]: endpointNode
      });
    }

    // if it's in the dictionary, then subscribe
    if (typeof EndpointDictionary[hashedId] != "undefined")
      toSubscribe.push(endpoint.path.get());
  }

  return toSubscribe;
};

let DeviceDictionary, EndpointDictionary;

let buildNetwork = async function(_graph) {
  let networkNode = await createOrGetContext(_graph);

  var configs = [];

  //   configs.push(
  //     await Promise.resolve(new SpinalNetwork(config.networkConnector))
  //   ); //

  configs.push(await networkNode.getElement());

  if (!networkNode.hasRelation("hasBeenLoaded", "Ref")) {
    networkNode.addChild(new Model(), "hasBeenLoaded", "Ref");
    networkNode.addChild(new Model(), "hasBeenLoaded", "Ref");
  }

  var child = await networkNode.getChildren(["hasBeenLoaded"]);

  configs.push(await child[0].getElement());
  configs.push(await child[1].getElement());

  let DeviceEndpointDictionary = {};

  let network = configs[0];
  DeviceDictionary = configs[1];
  EndpointDictionary = configs[2];

  let containers = await network.discover();

  //createDevices

  var dictionaries = await createDevices(
    networkNode,
    containers,
    DeviceDictionary
  );

  let cpt = 0;

  for (var i = 0; i < containers.length; i++) {
    let d = containers[i].device;

    if (typeof DeviceDictionary[d.path.get().hashCode()] !== "undefined") {
      DeviceEndpointDictionary[d.path.get().hashCode()] = dictionaries[cpt++];
    }
  }

  let toSubscribe = [];

  // iterate and add devices if they are not already stored
  for (var i = 0; i < containers.length; i++) {
    let d = containers[i].device;

    deviceNode = DeviceDictionary[d.path.get().hashCode()];

    // check if they are not stored
    // TODO: check _attr_names instead of undefined type?
    if (typeof d.path.get() !== "undefined") {
      // add endpoints

      toSubscribe = await createEndpoints(
        d,
        deviceNode,
        containers,
        DeviceEndpointDictionary,
        EndpointDictionary,
        i
      );

      network.subscribe(toSubscribe, updateValues);
    }
  }
};

async function updateValues(endpointObjects) {
  let endpoints = [];
  let histories = [];
  let newValues = [];

  for (var i = 0; i < endpointObjects.length; i++) {
    let endpoint = endpointObjects[i];

    let endpointNode = EndpointDictionary[endpoint.path.hashCode()];

    let v = endpoint.value;

    newValues.push(v);

    endpoints.push(endpointNode.getElement());

    let endpointHistory = await endpointNode.getChildren(["hasHistory"]);

    if (endpointHistory.length == 1)
      histories.push(endpointHistory[0].getElement());
    //else
    // TODO: create history and push?
  }

  return Promise.all(endpoints).then(_endpoints => {
    for (var i = 0; i < _endpoints.length; i++)
      _endpoints[i].currentValue.set(newValues[i]);

    return Promise.all(histories)
      .then(timeSeries => {
        for (var i = 0; i < timeSeries.length; i++) {
          timeSeries[i].addToTimeSeries(newValues[i]);
        }
      })
      .catch(console.log);
  });
}
