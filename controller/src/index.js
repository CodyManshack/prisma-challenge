const express = require('express');
const Docker = require('dockerode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const rProxyConfig = require('./rproxy-config');

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

// GET /instances → list running containers
app.get('/instances', async (req, res) => {
    try {
        const instances = registry.read();

        res.json({ instances, count: instances.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
            name: info.Name.replace(/^\//, ''), // remove leading slash from docker container name
            image: info.Config.Image,
            state: info.State.Status,
            created: info.Created,
            port: hostPort,
        };

        registry.addInstance(record);

        await rProxyConfig.writeInstanceConfigAndReload(docker, record);

        res.status(201).json(record);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function stopAndRemoveContainerIfExists(id) {
    const container = docker.getContainer(id);

    try {
        const info = await container.inspect();

        if (info.State.Running) {
            await container.stop();
        }

        return await container.remove();
    } catch (err) {
        if (err.statusCode === 404) {
            console.log(`container ${id} not found in Docker, skipping removal`);
            return { removed: false, notFound: true };
        }

        throw err;
    }
}

// DELETE /instances → delete all instances in the registry
// I don't like nested try catch blocks, but I'll leave this for now
app.delete('/instances', async (req, res) => {
    try {
        const instances = registry.read();

        for (const instance of instances) {
            const { id, name } = instance;

            if (!id) {
                continue;
            }

            try {
                await stopAndRemoveContainerIfExists(id);
                await rProxyConfig.deleteInstanceConfigAndReload(docker, instance);
            } catch (err) {
                console.error(`error cleaning up instance ${name || id}:`, err.message);
            }
        }

        // clear the registry after attempting to remove all containers
        registry.write([]);

        res.status(200).json({
            message: 'all instances deleted (registry cleared)',
            deletedCount: instances.length,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /instances/:id → stop and remove a container
// Here ":name" refers to the Docker container name; we look up the ID via the registry
app.delete('/instances/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const instances = registry.read();
        const instance = instances.find(i => i.name === name);

        if (!instance) {
            return res.status(404).json({ error: 'instance not found' });
        }

        await stopAndRemoveContainerIfExists(instance.id);

        await rProxyConfig.deleteInstanceConfigAndReload(docker, instance);

        // remove from registry regardless
        registry.removeInstance(instance.id);

        res.status(200).json({ message: `instance "${name}" deleted successfully` });
    } catch (error) {
        console.error('error deleting instance:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Controller API listening on port ${port}`);
});
