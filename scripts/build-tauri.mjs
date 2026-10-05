import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = process.cwd();
const apiDir = path.join(root, 'src', 'app', 'api');
const tempDir = path.join(root, 'src', 'app', '_api');

const hasApi = fs.existsSync(apiDir);

// Sidecar uses Python 3.11 .venv script directly


try {
  if (hasApi) {
    fs.renameSync(apiDir, tempDir);
  }
  console.log('[build-tauri] Building static frontend export for Tauri...');
  execSync('next build', {
    stdio: 'inherit',
    env: { ...process.env, NEXT_EXPORT: 'true' }
  });
  console.log('[build-tauri] Static export complete in ./out');
} finally {
  if (fs.existsSync(tempDir)) {
    fs.renameSync(tempDir, apiDir);
  }
}
