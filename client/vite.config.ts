import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Dev-only middleware: lets the mesh viewer's "fixer mode" persist a highlighted
// screen capture into <repo>/mesh-fixes/ so the image can be linked to the LLM.
function meshFixSaver(): Plugin {
  return {
    name: 'mesh-fix-saver',
    configureServer(server) {
      server.middlewares.use('/__save-mesh-fix', (req, res, next) => {
        if (req.method !== 'POST') return next();
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
              filename?: string;
              dataUrl?: string;
            };
            const dataUrl = body.dataUrl ?? '';
            const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
            if (!match) throw new Error('Expected a PNG data URL');

            // Sanitize the requested name → basename, .png extension, safe chars.
            const raw = (body.filename ?? 'mesh-fix').replace(/[/\\]/g, '_');
            const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.png$/i, '');
            const dir = resolve(server.config.root, '..', 'mesh-fixes');
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            const filePath = resolve(dir, `${safe}.png`);
            writeFileSync(filePath, Buffer.from(match[1], 'base64'));

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: filePath }));
          } catch (err) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  } satisfies Plugin;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Default to localhost:8000 if VITE_SERVER_URL is not set
  const serverUrl = env.VITE_SERVER_URL || 'http://127.0.0.1:8000';

  return {
    plugins: [meshFixSaver()],
    server: {
      host: true,
      port: 5173,
      allowedHosts: ['wow.rafaelpernil.com', 'play.worldofpromptcraft.com'],
      fs: {
        allow: ['..'],
      },
      proxy: {
        '/ws': {
          target: serverUrl,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
        // Lets WorldManifest.fetchAsync() pull the latest saved manifest from
        // the backend (GET /world/manifest) instead of the build-time bundle.
        '/world': {
          target: serverUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
