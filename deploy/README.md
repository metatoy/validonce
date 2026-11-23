<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 Metatoy LLC
-->

# Deploying the demo to Kubernetes

The demo is two services: the FastAPI example (`examples/fastapi-app`) and the React form (`examples/react-form`), served by unprivileged nginx. The browser only talks to the web pod. nginx serves the form and forwards `/api/...` to the API with the `/api` prefix removed, the same way the Vite dev server does.

What is here:

- `docker/api.Dockerfile` and `docker/web.Dockerfile` build the two images. Both run as non-root users on pinned base images. Build them from the repo root, because the API installs `python/` and the form builds `js/` from the pnpm workspace.
- `docker/nginx.conf` is the config baked into the web image for plain `docker run`. The chart mounts its own copy from a ConfigMap.
- `helm/validonce-demo/` is the Helm chart: two Deployments and two Services, readiness and liveness probes, resource requests, non-root containers with read-only root filesystems, NetworkPolicies, an optional Ingress (off by default) and a `helm test` pod.
- `.github/workflows/k8s.yml` builds both images, starts a kind cluster, installs the chart and runs `helm test` on every change to the demo, the libraries or this folder.

The NetworkPolicies let anyone reach the web pod on its port. The web pod may only call the API and cluster DNS. The API accepts traffic only from the web pods and the test pod, and makes no outbound calls.

`helm test` posts a signup with `plan=pro` and no company through the web Service's `/api` and expects HTTP 422, posts a valid one and expects 200, and checks that `/api/openapi.json` carries the `x-validonce` rules.

The images are not published to a registry. You build them and load them into the cluster yourself.

## Local, with kind

You need Docker, kind, kubectl and Helm. From the repo root:

```sh
kind create cluster --name validonce

docker buildx build -f deploy/docker/api.Dockerfile -t validonce-demo-api:dev \
  --provenance=false --output type=docker,dest=/tmp/validonce-api.tar .
docker buildx build -f deploy/docker/web.Dockerfile -t validonce-demo-web:dev \
  --provenance=false --output type=docker,dest=/tmp/validonce-web.tar .
kind load image-archive /tmp/validonce-api.tar --name validonce
kind load image-archive /tmp/validonce-web.tar --name validonce

helm lint deploy/helm/validonce-demo
helm install demo deploy/helm/validonce-demo --wait
helm test demo --logs
```

Then open the form:

```sh
kubectl port-forward svc/demo-validonce-demo-web 8080:80
# browse to http://localhost:8080
```

Try a broken signup from the command line. It should return 422:

```sh
curl -i -H 'Content-Type: application/json' \
  -d '{"plan":"pro","email":"a@example.test","start":"2026-01-01","quantity":1}' \
  http://localhost:8080/api/signups
```

Clean up with `kind delete cluster --name validonce`.

The images are written to archives and loaded with `kind load image-archive` because `kind load docker-image` can fail when Docker uses the containerd image store, which Docker Desktop does by default. If your Docker uses the classic store, `docker build` followed by `kind load docker-image` works too.

kind's default network plugin enforces NetworkPolicy, so the policies are active on a kind cluster.

## k3s

k3s runs containerd, so import the images into it instead of loading them into kind. On the k3s host, from the repo root:

```sh
docker buildx build -f deploy/docker/api.Dockerfile -t validonce-demo-api:dev \
  --provenance=false --output type=docker,dest=/tmp/validonce-api.tar .
docker buildx build -f deploy/docker/web.Dockerfile -t validonce-demo-web:dev \
  --provenance=false --output type=docker,dest=/tmp/validonce-web.tar .
sudo k3s ctr images import /tmp/validonce-api.tar
sudo k3s ctr images import /tmp/validonce-web.tar

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm install demo deploy/helm/validonce-demo --wait \
  --set api.image.pullPolicy=Never --set web.image.pullPolicy=Never
helm test demo --logs
```

For a cluster with more than one node, push the images to a registry the nodes can pull from and set `api.image.repository`, `web.image.repository` and the tags to match.

k3s ships Traefik as its ingress controller and enforces NetworkPolicy out of the box. To reach the form through Traefik:

```sh
helm upgrade demo deploy/helm/validonce-demo --reuse-values \
  --set ingress.enabled=true --set ingress.className=traefik \
  --set ingress.host=validonce.example.test
```

Point `validonce.example.test` at the node in your hosts file and browse to it.

## Values

See `helm/validonce-demo/values.yaml`. `values.schema.json` validates overrides. For example, it rejects an unknown key or a negative replica count.
