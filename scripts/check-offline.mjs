// Static half of the offline guarantee (the dynamic half is the self-test run without a network in CI).
// Fails when something could let the app reach the network:
//   1. an HTTP / WebSocket / TLS client crate among the app's runtime dependencies (any OS);
//   2. socket APIs in our own Rust code;
//   3. network APIs in the UI source;
//   4. a Content-Security-Policy that allows a remote origin.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
/** The desktop targets we ship (Tauri also lists mobile-only dependencies, e.g. reqwest on iOS/Android). */
const DESKTOP_TARGETS = ['x86_64-pc-windows-msvc', 'aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu'];
const problems = [];

// 1. Runtime crates. Build-only dependencies (e.g. tesseract-rs downloading sources while compiling) are allowed.
const NET_CRATES = ['reqwest', 'hyper', 'hyper-util', 'ureq', 'curl', 'curl-sys', 'isahc', 'attohttpc', 'surf', 'h2', 'h3',
  'rustls', 'native-tls', 'openssl', 'openssl-sys', 'tungstenite', 'tokio-tungstenite', 'quinn', 'trust-dns-resolver', 'hickory-resolver'];
const tree = execFileSync('cargo', ['tree', '-e', 'normal', ...DESKTOP_TARGETS.flatMap((t) => ['--target', t]), '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml'),
  '--prefix', 'none', '--format', '{p}'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString();
const crates = new Set(tree.split('\n').map((l) => l.trim().split(' ')[0]).filter(Boolean));
for (const c of NET_CRATES) if (crates.has(c)) problems.push(`runtime dependency on network crate "${c}" (cargo tree -i ${c})`);

// 2 + 3. Source scans.
function scan(dir, exts, pattern, what) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'target' && e.name !== 'node_modules') scan(p, exts, pattern, what); continue; }
    if (!exts.some((x) => e.name.endsWith(x)) || e.name.endsWith('.test.ts')) continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (pattern.test(line)) problems.push(`${what}: ${path.relative(root, p)}:${i + 1}: ${line.trim()}`);
    });
  }
}
scan(path.join(root, 'src-tauri', 'src'), ['.rs'], /std::net|TcpStream|UdpSocket|TcpListener/, 'socket API');
scan(path.join(root, 'src-tauri', 'crates'), ['.rs'], /std::net|TcpStream|UdpSocket|TcpListener/, 'socket API');
scan(path.join(root, 'src'), ['.ts', '.tsx'], /\bfetch\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|https?:\/\/(?!localhost|kfile\.localhost|ipc\.localhost|www\.w3\.org)/, 'network API in UI');

// 4. CSP: only the app itself, data/blob URLs, the ipc: and kfile: protocols (and their Windows *.localhost forms).
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const csp = conf.app?.security?.csp ?? '';
if (!csp) problems.push('tauri.conf.json has no Content-Security-Policy');
for (const origin of csp.match(/https?:\/\/[^\s;]+/g) ?? []) {
  if (!/^http:\/\/(kfile|ipc)\.localhost$/.test(origin)) problems.push(`CSP allows a remote origin: ${origin}`);
}

if (problems.length) { for (const p of problems) console.error(`✗ ${p}`); process.exit(1); }
console.log(`Offline check passed (${crates.size} runtime crates scanned).`);
