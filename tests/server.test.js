// Mock redis to avoid real network calls
jest.mock('redis', () => {
  const store = new Map();
  const client = {
    isOpen: true,
    connect: jest.fn().mockResolvedValue(),
    quit: jest.fn().mockResolvedValue(),
    set: jest.fn(async (k, v) => { store.set(k, v); return 'OK'; }),
    get: jest.fn(async (k) => store.get(k) ?? null),
    del: jest.fn(async (k) => (store.delete(k) ? 1 : 0)),
    on: jest.fn()
  };
  return { createClient: () => client };
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
    await expect(appServer.client.set('foo', 'bar')).resolves.toBe('OK');
    await expect(appServer.client.get('foo')).resolves.toBe('bar');
    await expect(appServer.client.del('foo')).resolves.toBe(1);
  });

  it('socket.io accepts connection', (done) => {
    clientSocket = ioc(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
    clientSocket.on('connect', done);
    clientSocket.on('connect_error', done); // fail fast if misconfigured
  });
});