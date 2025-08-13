const store = new Map();

const client = {
  __isMock: true,
  isOpen: true,
  connect: jest.fn().mockResolvedValue(),
  quit: jest.fn().mockResolvedValue(),
  on: jest.fn(),
  set: jest.fn(async (k, v) => { store.set(k, v); return 'OK'; }),
  get: jest.fn(async (k) => store.get(k) ?? null),
  del: jest.fn(async (k) => (store.delete(k) ? 1 : 0))
};

module.exports = { createClient: jest.fn(() => client) };