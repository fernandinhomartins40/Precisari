// Ephemeral App Store signing for CI, through the App Store Connect API (no device, no stored certificate).
//   node asc-signing.cjs create <bundleId> <outDir>  → outDir/{key.pem,cert.cer,profile.mobileprovision,ids.json}
//   node asc-signing.cjs cleanup <outDir>            → deletes the profile and revokes the certificate
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (.p8). Run artifacts already uploaded stay valid after the revoke.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;

function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' });
  const body = b64({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  const key = crypto.createPrivateKey(fs.readFileSync(ASC_KEY_PATH));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function api(method, p, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method,
    headers: { authorization: `Bearer ${jwt()}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function create(bundleIdentifier, out) {
  fs.mkdirSync(out, { recursive: true });
  const keyPath = path.join(out, 'key.pem');
  execFileSync('openssl', ['genrsa', '-out', keyPath, '2048'], { stdio: 'ignore' });
  const csr = execFileSync('openssl', ['req', '-new', '-key', keyPath, '-subj', '/CN=Precisari CI/O=Precisari/C=BR'], { encoding: 'utf8' });
  const csrContent = csr.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

  const cert = await api('POST', '/v1/certificates', { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent } } });
  fs.writeFileSync(path.join(out, 'cert.cer'), Buffer.from(cert.data.attributes.certificateContent, 'base64'));
  const ids = { certificateId: cert.data.id };
  fs.writeFileSync(path.join(out, 'ids.json'), JSON.stringify(ids));

  const bundles = await api('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleIdentifier)}`);
  const bundle = bundles.data.find((b) => b.attributes.identifier === bundleIdentifier);
  if (!bundle) throw new Error(`bundle id ${bundleIdentifier} not registered`);

  const name = `Precisari CI ${process.env.GITHUB_RUN_ID ?? Date.now()}`;
  const profile = await api('POST', '/v1/profiles', {
    data: {
      type: 'profiles',
      attributes: { name, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundle.id } },
        certificates: { data: [{ type: 'certificates', id: cert.data.id }] },
      },
    },
  });
  fs.writeFileSync(path.join(out, 'profile.mobileprovision'), Buffer.from(profile.data.attributes.profileContent, 'base64'));
  Object.assign(ids, { profileId: profile.data.id, profileName: name, profileUuid: profile.data.attributes.uuid });
  fs.writeFileSync(path.join(out, 'ids.json'), JSON.stringify(ids));
  console.log(`profile ${name} (${ids.profileUuid}), certificate ${ids.certificateId}`);
}

async function cleanup(out) {
  const file = path.join(out, 'ids.json');
  if (!fs.existsSync(file)) return;
  const ids = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (ids.profileId) await api('DELETE', `/v1/profiles/${ids.profileId}`).catch((e) => console.log(e.message));
  if (ids.certificateId) await api('DELETE', `/v1/certificates/${ids.certificateId}`).catch((e) => console.log(e.message));
  console.log('signing assets removed');
}

const [cmd, a, b] = process.argv.slice(2);
(cmd === 'create' ? create(a, b) : cleanup(a)).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
