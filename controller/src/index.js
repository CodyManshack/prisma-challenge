const express = require('express');
const Docker = require('dockerode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const webServerPath = path.resolve(__dirname, 'web-server');
const webServerImage = 'web-server:latest';
const webServerBasePort = 3000;

// ** Begin AI Generated Code **
// mostly AI Generated (I have not worked with dockerode before) and edited afterwards
// build the web-server image on startup
(async () => {
    try {
        console.log('building web-server image...');        
        const stream = await docker.buildImage({
            context: webServerPath,
            src: ['Dockerfile', 'index.html', 'nginx.conf']
        }, {
            t: webServerImage
        });

        // follow build progress and log output
        await new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, 
                (err, res) => err ? reject(err) : resolve(res),
                (event) => {
                    if (event.stream) {
                        process.stdout.write(event.stream);
                    }
                }
            );
        });

        console.log('web-server image built successfully');
        
        // verify the image exists
        const images = await docker.listImages({ filters: { reference: [webServerImage] } });
        if (images.length === 0) {
            throw new Error(`${webServerImage} image not found after build`);
        }
    } catch (error) {
        console.error('failed to build web-server image:', error.message);
        process.exit(1);
    }
})();
// ** End AI Generated Code **

// load container registry on startup
const registry = require('./registry');
(async () => {
    try {
        await registry.read();
        console.log('container registry loaded successfully');
    } catch (error) {
        console.error('failed to load container registry:', error.message);
        process.exit(1);
    }
})();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// POST /instances → start a new web-instance container
app.post('/instances', async (req, res) => {
  try {
    const { image = webServerImage, name, env = [] } = req.body;

    // determine next port in a simple round-robin style starting from BASE_PORT
    const instances = registry.read();
    const lastPort = instances.length
      ? Math.max(...instances.map(i => i.port || webServerBasePort))
      : webServerBasePort;
    const hostPort = lastPort + 1;

    const container = await docker.createContainer({
      Image: image,
      name: name ? name : undefined,
      Env: env,
      HostConfig: {
        PublishAllPorts: false,
        PortBindings: {
            "80/tcp": [{ HostPort: hostPort.toString() }]
        },
        RestartPolicy: { Name: 'no' }
      }
    });

    await container.start();
    const info = await container.inspect();

    const record = {
      id: info.Id,
      name: info.Name,
      image: info.Config.Image,
      state: info.State.Status,
      created: info.Created,
      port: hostPort,
    };

    registry.addInstance(record);

    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Controller API listening on port ${port}`);
});
