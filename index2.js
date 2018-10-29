let organType = typeof window === "undefined" ? global : window;

var Q = require("q");
var spinalCore = require("spinal-core-connectorjs");
require("spinal-lib-forgefile");
var config = require("./config");

var SpinalDevice = require("spinal-models-bmsNetwork").SpinalDevice;
var SpinalEndpoint = require("spinal-models-bmsNetwork").SpinalEndpoint;
var SpinalNetwork = require("spinal-models-bmsNetwork").SpinalNetwork;
var TimeSeries = require("spinal-models-timeSeries").TimeSeries;

var spinalgraph = require("spinalgraph");

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

const connect_opt =
  `http://${config.spinalConnector.user}:${
  config.spinalConnector.password
}@${config.spinalConnector.host}:${config.spinalConnector.port}/`;

var conn = spinalCore.connect(connect_opt);

let wait_for_endround = file => {
  let deferred = Q.defer();
  return wait_for_endround_loop(file, deferred);
};

let wait_for_endround_loop = (_file, defer) => {
  if (organType.FileSystem._sig_server === false) {
    setTimeout(() => {
      defer.resolve(wait_for_endround_loop(_file, defer));
    }, 100);
  } else defer.resolve(_file);
  return defer.promise;
};

let getGraph = _file => {
  return new Promise(function(resolve, reject) {
    if (_file.graph) return resolve(_file.graph);

    var _graph = new spinalgraph.SpinalGraph();

    wait_for_endround(_graph).then(() => {
      _file.add_attr({
        graph: _graph
      });
      resolve(_graph);
    });
  });

  return _graph;
};


let getContext = _graph => {
  return new Promise(function(resolve, reject) {

    _graph.getChildren(["hasContext"]).then(el => {

      for (var i = 0; i < el.length; i++) {
        if (el[i].info.type == config.networkConnector.appName) {
          return resolve(el[i]);
        }
      }

      var network = new SpinalNetwork(config.networkConnector);

      wait_for_endround(network).then(() => {
        var virtualContext = new spinalgraph.SpinalContext(
          config.networkConnector
          .appName, network);
        wait_for_endround(virtualContext).then(() => {
          virtualContext.element.ptr.set(network);

          _graph.addContext(virtualContext);
          resolve(virtualContext);
        })
      })
    })


  });

}


spinalCore.load(conn, config.file.path, _file => {
  wait_for_endround(_file).then(() => {
    getGraph(_file).then(_graph => {
      buildNetwork(_graph);
    });
  });
});



let createDevices = function(configs) {

  var promises = [];

}


let addItemInsidePromise = async function(liste,deviceChildren) {
  deviceChildren.then( el => {
    liste.push(el[0].getElement());
  })
}



let DeviceDictionary, EndpointDictionary;



let buildNetwork = async function(_graph) {
  getContext(_graph).then(context => {
    let networkNode = context;
    var promises = [];

    // promises.push(networkNode.getElement())

    promises.push(Promise.resolve(new SpinalNetwork(config.networkConnector)));
    if (!networkNode.hasRelation("hasBeenLoaded", 0)) {
      networkNode.addChild(new Model(), "hasBeenLoaded", 0)
      networkNode.addChild(new Model(), "hasBeenLoaded", 0)
    }

    var children = networkNode.getChildren(["hasBeenLoaded"]);



    children.then(child => {
      promises.push(child[0].getElement());
      promises.push(child[1].getElement());

      let DeviceEndpointDictionary = {};

      return Promise.all(promises)
        .then((configs) => {

          let network = configs[0]
          DeviceDictionary = configs[1]
          EndpointDictionary = configs[2]

          return network.discover()
            .then((containers) => {

              var promises2 = []

              for (var i = 0; i < containers.length; i++) {
                let d = containers[i].device;

                // add device

                let deviceNode;

                if (typeof DeviceDictionary[d.path.get().hashCode()] ==
                  "undefined") {

                  deviceNode = new spinalgraph.SpinalNode("SpinalNode",d);
                  

                  networkNode.addChild(
                    deviceNode,
                    "hasDevice",
                    0
                  );

                  DeviceDictionary.add_attr({
                    [d.path.get().hashCode()]: deviceNode
                  });

                }

                deviceNode = DeviceDictionary[d.path.get().hashCode()];

                if (!deviceNode.hasRelation("hasBeenLoaded", 0)) {
                  deviceNode.addChild(new Model(), "hasBeenLoaded", 0)
                }
            
                var deviceChildren = deviceNode.getChildren(["hasBeenLoaded"]);

                
                await addItemInsidePromise(promises2,deviceChildren);
              

              }

              console.log("promise2",promises2);


              // return Promise.all(promises2)
              //   .then((dictionaries) => {

              //     let t = 0;

              //     for (var i = 0; i < containers.length; i++) {
              //       let d = containers[i].device;

              //       if (typeof DeviceDictionary[d.path.get().hashCode()] !==
              //         "undefined") {
              //         DeviceEndpointDictionary[d.path.get().hashCode()] =
              //           dictionaries[t++];
              //       }

              //     }
              //     let toSubscribe = []

              //     // iterate and add devices if they are not already stored
              //     for (var i = 0; i < containers.length; i++) {
              //       let d = containers[i].device;

              //       deviceNode = DeviceDictionary[d.path.get().hashCode()];

              //       // check if they are not stored
              //       // TODO: check _attr_names instead of undefined type?
              //       if (typeof d.path.get() !== "undefined") {

              //         // add endpoints

              //         for (var j = 0; j < containers[i].endpoints.length; j++) {

              //           let endpoint = containers[i].endpoints[j]
              //           let hashedId = endpoint.path.get().hashCode();

              //           if (typeof DeviceEndpointDictionary[d.path.get()
              //               .hashCode()][hashedId] == "undefined") {

              //             let endpointNode = deviceNode.addToExistingRelationByApp(
              //               appName,
              //               "hasEndpoint",
              //               endpoint,
              //               true
              //             ).node;

              //             let timeSeries = new TimeSeries()
              //             endpointNode.addToExistingRelationByApp(
              //               appName, 'hasHistory', timeSeries)

              //             if (typeof EndpointDictionary[hashedId] ===
              //               "undefined") {
              //               EndpointDictionary.add_attr({
              //                 [hashedId]: endpointNode
              //               });
              //             }

              //             DeviceEndpointDictionary[d.path.get().hashCode()]
              //               .add_attr({
              //                 [hashedId]: endpointNode
              //               });

              //           }

              //           // if it's in the dictionary, then subscribe
              //           if (typeof EndpointDictionary[hashedId] !=
              //             "undefined")
              //             toSubscribe.push(endpoint.path.get());

              //         }

              //         network.subscribe(toSubscribe, updateValues);

              //       }

              //     }

              //   })
              //   .catch(console.log)
            })
            .catch(console.log)
        })
        .catch(console.log)
    })
  })
}