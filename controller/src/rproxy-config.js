const path = require("path");
const fs = require("fs");
const rProxyContainerName = "rproxy";
const rProxyPath = path.resolve(__dirname, "rproxy");
const upstreamsDir = path.join(rProxyPath, "upstreams");
const locationsDir = path.join(rProxyPath, "locations");

function ensureDirs() {
    if (!fs.existsSync(upstreamsDir)) {
        fs.mkdirSync(upstreamsDir, { recursive: true });
    }
    if (!fs.existsSync(locationsDir)) {
        fs.mkdirSync(locationsDir, { recursive: true });
    }
}

const getUpstreamConf = ({ name, port }) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");

    return `
upstream instance_${safeName} {
    server host.docker.internal:${port};
}
`.trimStart();
};

const getLocationConf = ({ name }) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");

    return `
location /apps/${safeName}/ {
    rewrite ^/apps/${safeName}/(.*)$ /$1 break;
    proxy_pass http://instance_${safeName};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
`.trimStart();
};

function writeInstanceConfig({ name, port }) {
    if (!port || !name) return;

    ensureDirs();

    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");

    const upstreamPath = path.join(upstreamsDir, `instance-${safeName}.conf`);
    const locationPath = path.join(locationsDir, `instance-${safeName}.conf`);

    fs.writeFileSync(
        upstreamPath,
        getUpstreamConf({ name: safeName, port }),
        "utf8"
    );
    fs.writeFileSync(locationPath, getLocationConf({ name: safeName }), "utf8");
}

function deleteInstanceConfig({ name }) {
    if (!name) return;

    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");

    const upstreamPath = path.join(upstreamsDir, `instance-${safeName}.conf`);
    const locationPath = path.join(locationsDir, `instance-${safeName}.conf`);

    [upstreamPath, locationPath].forEach((filePath) => {
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            if (err.code !== "ENOENT") {
                console.error(
                    `error deleting config for ${safeName} at ${filePath}:`,
                    err.message
                );
            }
        }
    });
}

// pass in dockerode instance
async function reloadRProxy(docker) {
    const rproxy = docker.getContainer(rProxyContainerName);

    // validate config
    const testExec = await rproxy.exec({
        Cmd: ["nginx", "-t"],
        AttachStdout: true,
        AttachStderr: true,
    });

    await testExec.start({});

    console.log("nginx config is valid, reloading…");

    const reloadExec = await rproxy.exec({
        Cmd: ["nginx", "-s", "reload"],
        AttachStdout: true,
        AttachStderr: true,
    });

    await reloadExec.start({});
    console.log("rproxy reloaded");
}

async function writeInstanceConfigAndReload(docker, { name, port }) {
    try {
        writeInstanceConfig({ name, port });
        await reloadRProxy(docker);
    } catch (err) {
        console.debug(
            "error writing instance config and reloading rProxy:",
            err.message
        );
        deleteInstanceConfig({ name });
        throw err;
    }
}

async function deleteInstanceConfigAndReload(docker, { name }) {
    try {
        deleteInstanceConfig({ name });
        await reloadRProxy(docker);
    } catch (err) {
        console.debug(
            "error deleting instance config and reloading rProxy:",
            err.message
        );
        throw err;
    }
}

module.exports = {
    writeInstanceConfigAndReload,
    deleteInstanceConfigAndReload,
};
