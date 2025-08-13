// src/mediasoup-config.js
const mediasoup = require('mediasoup');
//importing os to get number of cores
const os = require('os');
const numCores = os.cpus().length;

const workerSettings = {
  logLevel: 'warn',
  rtcMinPort: 10000,
  rtcMaxPort: 10100
};

const workers = [];
let nextWorkerIndex = 0;
const routers = new Map();

const createWorkers = async () => {
  for (let i = 0; i < numCores; i++) {
    const worker = await mediasoup.createWorker(workerSettings);
    worker.on('died', () => {
      console.error(`Mediasoup worker ${i} died`);
      setTimeout(() => process.exit(1), 2000);
    });
    workers.push(worker);
  }
  console.log(`Created ${workers.length} mediasoup workers`);
};

const getNextWorker = () => {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
};

// Getter function to safely access `router`
const getRouter = async (roomId) => {
  let router = routers.get(roomId);
  if (!router || router.closed) {
    router = await createRouter(roomId);
  }
  return router;
};

const createRouter = async (roomId) => {
  const worker = getNextWorker();
  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000
      }
    ]
  });
  routers.set(roomId, router);
  console.log(`Created router for room ${roomId} on worker ${worker.pid}`);
  return router;
};

module.exports = {
  createWorkers,
  getRouter
};