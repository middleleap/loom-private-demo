import { transition, validateHistory } from './domain.mjs';
export const hosted = true;
export const artifact = path => '/evidence/' + path.split('/').map(encodeURIComponent).join('/');
let bundle, current;
const key = 'loom-demo-session-v1';
function notice(message) { const el = document.getElementById('storage-notice'); if (el) el.textContent = message; }
async function load() {
 if (bundle) return bundle;
 const response = await fetch('/evidence/bundle.json');
 if (!response.ok) throw new Error('Recorded evidence is unavailable. Reload or contact the presenter.');
 const candidate = await response.json();
 const manifest = await fetch('/evidence/integrity.json').then(r => {if (!r.ok) throw new Error('Evidence integrity record unavailable');return r.json();});
 const bytes = new TextEncoder().encode(JSON.stringify(candidate));
 const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if (digest !== manifest.bundle_sha256) throw new Error('Recorded evidence has changed. Results cannot be displayed.');
 bundle = candidate;
 return bundle;
}
function persist() { try {sessionStorage.setItem(key,JSON.stringify(current));} catch {notice('Storage unavailable: this session works in memory; reloading resets your cases.');} }
export async function state() {
 const b = await load();
 if (!current) {
  current = { revision:0,cases:structuredClone(b.cases),version:b.version };
  try {
   const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
   if (saved && saved.version === b.version && Number.isInteger(saved.revision) && saved.revision >= 0 && !validateHistory(saved.cases).length) current = saved;
   else if (saved) notice('An older or invalid session was reset to the synthetic starting cases.');
  } catch {notice('Stored state unavailable: using a fresh in-memory scenario.');}
 }
 return {...structuredClone(current),context:b.context,report:b.report};
}
export async function report() { return structuredClone((await load()).report); }
export async function post(path, body) {
 await state();
 if (path === 'reset') {current = {revision:0,cases:structuredClone(bundle.cases),version:bundle.version};persist();return {};}
 if (path !== 'action') throw new Error('Hosted mode displays recorded checks; it does not execute them.');
 if (body.revision !== current.revision) throw new Error('This view is stale. Refresh before changing the case.');
 current = {...current,revision:current.revision+1,cases:transition(current.cases,body)};
 persist();return structuredClone(current);
}
