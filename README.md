
# Host Package Requirements
* Docker Engine >= v28.4

> IMPORTANT!  
> update the docker socket in the `docker-compose.yaml` file for the `controller` application according to your host system:  
> - Linux: `/var/run/docker.sock:/var/run/docker.sock`  
> - Windows: `//./pipe/docker_engine`  
> - Windows (WSL): `/var/run/docker.sock`  