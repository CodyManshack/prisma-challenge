# Prisma Take Home Challenge
Overall, I think the task was enjoyable but the scope was a bit large for the budgeted hours. I prioritized delivering the core functionality: a minimal, working control plane paired with automatic reverse proxy routing. Non-essential enhancements (true infra as code, runtime config, SSL termination) were explicitly deferred to keep scope focused on core dynamic instance management – but eventual addition of these features was accounted for in the repo.  

## System Requirements
### ✗ Ifrastructure as Code  
Not fulfilled. I do not have experience with Terraform. I have only ever automated build & deployment of VMs with the Docker / K8s / Helm stack or direct KVM / QEMU API interaction through proprietary code. Completing this task in the way I know how, or learning these tools, are out of scope for this task.
### ✓ Configuration Management
Fulfilled with Ansible configuration. I have tertiary experience with Ansible, but not much.
### ✓ Linux hardening / Basic container security
I have included what I would consider standard practice security configs for a newly deployed VM in the ansible configuration.
### ✓ External traffic routing / termination
All external traffic that is not on ports 80/443/2999 is terminated immediately. All traffic is routed through the reverse proxy to its' intended destination.
### ✓ Web server instances externally accessible via HTTP/S
All web server instances are accessible externally via http on port 80. I did not have time to setup ssl. It is an easy next improvement for this repository. SSL would likely be terminated at the reverse proxy, so that backend services do not have to worry about SSL.

## Technical Requirements
### ◐ Reproducible provisioning and configuration of the host, network, and runtime
Partially fulfilled. Minimal configuration of host and network is completed. No configurations exist for the runtime application. Provisioning is not fulfilled.
### ✓ Internal control surface (API)
It is possible to dynamically create, delete, and list web server instances.
### ✓ Route external requests to correct web server instance
Routing is configured automatically at the reverse proxy on creation / deletion of web instances.
### ✓ Basic verification
Simple script provided for windows & linux `verify.(ps1|sh)`

# Setup
To setup the application simply run `docker compose up -d` from the root of the project, after verifying your docker socket is setup properly. The control API will be almost immediately available at http://localhost, after a short image build.

## Host Package Requirements
* Docker Engine >= v28.4 (not sure exact version, but this is what is tested)

## ⚠️ IMPORTANT ⚠️
update the docker socket in the `docker-compose.yaml` file for the `controller` application according to your host system:  
  - Linux: `/var/run/docker.sock:/var/run/docker.sock`  
  - Windows: `//./pipe/docker_engine`  
  - Windows (WSL): `/var/run/docker.sock`  
    > The basic Linux version worked fine for me on Windows (WSL) - try that first.

# API Endpoints
> Endpoint Docs AI Generated  

The controller service runs inside the `controller` container and is exposed on port `3000` on the host.

Base URL (from host):

- `http://localhost:3000`

All endpoints return and accept JSON.

### Health

**GET `/health`**

Simple liveness check for the controller API.

- **Response 200**
	- Body:
		- `{ "status": "ok" }`

### List instances

**GET `/instances`**

Return all known (registered) web instances as tracked by the local registry.

- **Response 200**
	- Body:
		- `instances`: array of instance objects
		- `count`: number of instances

Instance object shape:

```jsonc
{
	"id": "<docker-id>",          // Docker container ID
	"name": "<docker-name>",      // Docker container name (primary identifier)
	"image": "web-server:latest", // Image used for the instance
	"state": "running",           // Docker-reported state
	"created": "2025-11-15T...Z", // Creation timestamp from Docker
	"port": 3001                  // Host port bound to container's port 80
}
```

### Create instance

**POST `/instances`**

Create and start a new web instance container, register it in the local registry, and register routing in the reverse proxy.

- **Request body** (all fields optional):

```jsonc
{
	"name": "my-instance",         // Docker container name; if omitted Docker auto-generates one
	"image": "web-server:latest",  // Image to use; defaults to the built-in web-server image
	"env": ["KEY=value"]           // Optional environment variables to inject
}
```

Behavior:

- Chooses the next available host port in a simple round-robin sequence starting at `3001`.
- Creates a container with:
	- `Image`: `image` (default `web-server:latest`)
	- `name`: `name` (if provided) or Docker-generated
	- `Env`: `env`
	- `HostConfig.PortBindings`: container `80/tcp` → host `port`
- Persists the instance in the on-disk registry.
- Writes per-instance nginx config under `/app/rproxy` and reloads the `rproxy` nginx to expose the instance.

- **Response 201**
	- Body: instance object (same shape as for `GET /instances`).

### Delete a single instance

**DELETE `/instances/:name`**

Delete a single instance by **Docker container name**.

- **Path parameters**
	- `name`: Docker container name as returned by the `name` field of the instance.

Behavior:

- Looks up the instance in the local registry by `name`.
- If not found → `404`.
- If found:
	- Stops and removes the container via its Docker `id`.
	- Removes the per-instance nginx config and reloads `rproxy`.
	- Removes the instance from the registry.

- **Response 200**
	- Body:
		- `{ "message": "instance \"<name>\" deleted successfully" }`

### Delete all instances

**DELETE `/instances`**

Stop and remove **all** instances currently tracked in the registry and clear routing.

Behavior:

- Loads all instances from the registry.
- For each instance:
	- Attempts to stop and remove the container by `id` (ignores Docker `404` if already gone).
	- Attempts to delete the per-instance nginx config and reload `rproxy`.
- Clears the registry file.

- **Response 200**
	- Body:
		- `{ "message": "all instances deleted (registry cleared)", "deletedCount": <n> }`
