module.exports = {
  networkConnector: {
    networkName: 'VirtualNetwork',
    appName: 'VirtualNetworkContext',
    type: 'MyFakeProtocol',
    path: '/VirtualNetwork',
    virtualDevices: 5,
    endpointsPerDevice: 3,
    updateInterval: 5000
  },
  spinalConnector: {
    user: 168,
    password: 'JHGgcz45JKilmzknzelf65ddDadggftIO98P',
    host: 'localhost',
    port: 7777,
    protocol: 'http'
  },
  file: {
    path: '/__users__/admin/s'
  }
}