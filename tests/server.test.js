// Mock redis to avoid real network calls and promisify its methods
jest.mock('redis', () => {
  const { promisify } = require('util');
  const redisMock = require('redis-mock');
  // Create a single mock client instance that will be shared.
  const mockClient = redisMock.createClient();

  // The real redis v4 client is promise-based. redis-mock is callback-based.
  // We need to wrap the mock's methods to return promises for our tests to work.
  const promisifiedClient = {
    ...mockClient,
    get: promisify(mockClient.get).bind(mockClient),
    set: promisify(mockClient.set).bind(mockClient),
    del: promisify(mockClient.del).bind(mockClient),
    on: mockClient.on.bind(mockClient),
    quit: promisify(mockClient.quit).bind(mockClient),
    // Add stubs for v4-specific properties/methods to prevent errors
    isOpen: true,
    connect: () => Promise.resolve(),
  };

  // The redis library was changed in v4 to export createClient directly.
  // We mock that behavior here.
  return {
    createClient: () => promisifiedClient,
  };
});

// Mock mediasoup-config to avoid spinning real workers
jest.mock('../server/mediasoup-config', () => ({
  createWorker: jest.fn(async () => {}),
  getRouter: jest.fn(async () => ({
    // minimal surface if your code calls it in tests
    createWebRtcTransport: jest.fn(async () => ({
      on: jest.fn(),
      close: jest.fn()
    }))
  }))
}));


const request = require('supertest')
const appServer = require('../server/server')
const ioc = require("socket.io-client");

let clientSocket;
let port;

beforeAll(async () => {
  // Start on an ephemeral port so CI doesn’t collide
  port = await appServer.startServer(0);
});

afterAll(async () => {
  if (clientSocket?.connected) clientSocket.disconnect();
  await appServer.stopServer();
});

describe('server smoke tests', () => {
  it('health endpoint responds', async () => {
    await request(`http://localhost:${port}`).get('/health').expect(200).expect({ ok: true });
  });

  it('redis client works (mocked)', async () => {
    const client = appServer.getClient()
    await expect(client.set('foo', 'bar')).resolves.toBe('OK');
    await expect(client.get('foo')).resolves.toBe('bar');
    await expect(client.del('foo')).resolves.toBe(1);
  });

  it('socket.io accepts connection', (done) => {
    clientSocket = ioc(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
    clientSocket.on('connect', done);
    clientSocket.on('connect_error', done); // fail fast if misconfigured
  });
});