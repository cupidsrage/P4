# Railway-ready multiplayer deployment

This repository is configured for Railway with a lightweight Node server that:

- serves the classic static Phantasia pages, and
- hosts a browser-playable multiplayer mode at `/play.html`.

## Deploy on Railway

1. Create a new Railway project.
2. Link this GitHub repository.
3. Railway builds using the included `Dockerfile`.
4. The app binds to Railway's `PORT` automatically.

## Local run

```bash
docker build -t p4-railway .
docker run --rm -p 8080:8080 -e PORT=8080 p4-railway
```

Open:

- <http://localhost:8080/> for the classic landing page.
- <http://localhost:8080/play.html> for the multiplayer browser game.

## Multiplayer gameplay

1. Open `/play.html` in multiple browser tabs (or on different devices).
2. Enter the same room name in each client.
3. Join and fight shared encounters together.

Game state is in-memory, which keeps deployment simple for Railway demos.
