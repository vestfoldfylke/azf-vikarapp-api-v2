const { server } = require('../mocks/server');
const config = require('../config');

module.exports = function setupMock() {
  if(config.USE_MOCK) server.listen();
}