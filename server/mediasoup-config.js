   // src/mediasoup-config.js
   const mediasoup = require('mediasoup');

   const workerSettings = {
     logLevel: 'warn',
     rtcMinPort: 10000,
     rtcMaxPort: 10100
   };

   let worker;
   let router;

   const createWorker = async () => {
     worker = await mediasoup.createWorker(workerSettings);
     worker.on('died', () => {
       console.error('MediaSoup worker has died');
     });

     router = await worker.createRouter({ mediaCodecs: [
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
      ] });
   };

   // Getter function to safely access `router`
const getRouter = () => {
    if (!router) {
      throw new Error("Router is not initialized. Make sure `createWorker()` has been called.");
    }
    return router;
  };

   module.exports = { createWorker, worker, getRouter };
