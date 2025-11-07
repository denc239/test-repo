# Discord‑like Prototype for Vercel

This project implements a simplified, self‑hosted alternative to
[Discord](https://discord.com), focusing on real‑time audio/video chat and screen
sharing. It is designed to run on the [Vercel](https://vercel.com) platform using
serverless functions for signalling and static assets for the client.

## Features

* **Audio and video calls:** Peers connect directly with each other using
  WebRTC.
* **Screen sharing:** Toggle screen sharing on demand. Both 30 fps and
  60 fps modes are supported, with resolutions up to 4K (2160p).
* **Rooms:** Join a room by entering its ID. New peers discover existing
  peers and automatically establish peer connections.
* **Long‑polling signalling:** The server uses HTTP endpoints (`/api/join`,
  `/api/send`, `/api/poll`, `/api/leave`) to exchange signalling messages
  between peers. Messages are queued in memory.

## File structure

```
vercel-app/
├── api/
│   ├── index.js      # Express server exposing signalling endpoints
├── public/
│   ├── index.html    # Client UI
│   └── script.js     # Client‑side logic (WebRTC and signalling)
├── package.json      # Project metadata and dependencies
└── README.md         # This file
```

## Deploying to Vercel

To deploy this application on Vercel:

1. Create a new project in your Vercel dashboard and connect it to your
   GitHub repository.
2. Ensure your repository contains the `vercel-app` directory at the
   root (the folder with this README). Vercel will automatically detect the
   serverless functions under `api/` and the static assets under `public/`.
3. Set the **Framework Preset** to **Other** and the **Root Directory** to
   `vercel-app` in your project settings.
4. Trigger a deployment. Vercel will install dependencies from
   `package.json` (including Express), build the project, and
   deploy it. The deployed URL will serve the client from `/` and
   the API endpoints from `/api`.

### Local development

If you wish to test the app locally before deploying:

1. Install [Node.js](https://nodejs.org) 18 or later.
2. Install dependencies:

   ```bash
   cd vercel-app
   npm install
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open your browser at `http://localhost:3000`. Because this Express
   implementation listens on the port provided by Vercel’s runtime,
   you can use [Vercel CLI](https://vercel.com/cli) for a local emulation or
   modify `api/index.js` to listen on a specific port during development.

## Limitations

* **In-memory signalling:** All room and message data is stored in memory. In
  a production environment, you should replace this with a persistent data
  store (e.g., Redis, a database, or an external signalling service) to
  support scaling and avoid data loss when serverless functions are cold
  started.
* **No authentication:** This prototype does not implement user
  authentication or authorization. Consider adding a user management
  system and secure signalling for a real production deployment.
* **Connection limits:** Since the server uses in-memory queues and is
  deployed as serverless functions, there are practical limits to the
  number of concurrent participants per room and the overall scalability of
  this solution.

Despite these limitations, this project demonstrates how to build and deploy
a functional real‑time communication platform using Vercel’s serverless
architecture.
