   // src/mediasoup-config.js
   const mediasoup = require('mediasoup');

   const workerSettings = {
     logLevel: 'warn',
     rtcMinPort: 10000,
     rtcMaxPort: 10100
   };

   let worker;
   let router;
   const routers = new Map();

   const createWorker = async () => {
     worker = await mediasoup.createWorker(workerSettings);
     worker.on('died', () => {
       console.error('MediaSoup worker has died');
       setTimeout(() => process.exit(1), 2000) // exit in 2 seconds
     });
   };

   // Getter function to safely access `router`
const getRouter = async(roomId) => {
    if (!worker) {
      throw new Error("Router is not initialized. Make sure `createWorker()` has been called.");
    }else{
      let curRouter = routers.get(roomId);
      if(!curRouter || curRouter.closed){
        curRouter = await createRouter(roomId);
      }
      return curRouter;
    }
  };

  const createRouter = async(roomId) => {
    if (!worker) {
      throw new Error("Router is not initialized. Make sure `createWorker()` has been called.");
    }else{
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
    }
    routers.set(`${roomId}`, router);
    return router;
  };
   module.exports = { createWorker, getRouter };
