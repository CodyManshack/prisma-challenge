const express = require('express');
const Docker = require('dockerode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const webServerImage = 'web-server:latest';

// ** Begin AI Generated Code **
// mostly AI Generated (I have not worked with dockerode before) and edited afterwards
// build the web-server image on startup
(async () => {
    try {
        console.log('building web-server image...');
        const stream = await docker.buildImage({
            context: path.resolve(__dirname, '../../web-server'),
            src: ['Dockerfile']
        }, {
            t: webServerImage
        });

        await new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
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

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// POST /instances → start a new web-instance container
app.post('/instances', async (req, res) => {
  try {
    const { image = webServerImage, name, env = [] } = req.body;

    const container = await docker.createContainer({
      Image: image,
      name: name || undefined,
      Env: env,
      HostConfig: {
        PublishAllPorts: false,
        PortBindings: {
            "80/tcp": [{ HostPort: "3001" }]
        },
        RestartPolicy: { Name: 'unless-stopped' }
      }
    });

    await container.start();
    const info = await container.inspect();

    res.status(201).json({
      id: info.Id,
      name: info.Name.replace(/^\//, ''),
      image: info.Config.Image,
      state: info.State.Status,
      created: info.Created
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Controller API listening on port ${port}`);
});
