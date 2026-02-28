# Railway-ready deployment

This repository has been prepared to deploy on [Railway](https://railway.app) using a Docker build.

## What was added

- `Dockerfile` – container image that serves this repository over HTTP.
- `railway.json` – Railway build/deploy config.
- `index.html` – minimal landing page so deployments return a successful response.

## Deploy on Railway

1. Create a new Railway project.
2. Link this GitHub repository.
3. Railway will detect the `Dockerfile` and build automatically.
4. On deploy, Railway injects the `PORT` environment variable used by the container.

## Local run

```bash
docker build -t p4-railway .
docker run --rm -p 8080:8080 -e PORT=8080 p4-railway
```

Then open <http://localhost:8080>.

The game is now directly playable in a browser at <http://localhost:8080/play.html> (single-player battle mode).
