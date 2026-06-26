import fs from 'node:fs';
import path from 'node:path';

const protoRoot = path.resolve('src/main/proto/community/apps/gramx/fifty/zero');
const outFile = path.resolve('consumer-registry-manifest.json');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.proto')) {
      files.push(fullPath);
    }
  }
  return files;
}

function parsePackage(text) {
  const match = text.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
  return match ? match[1] : '';
}

function parseGoPackage(text) {
  const match = text.match(/^\s*option\s+go_package\s*=\s*"([^"]+)"/m);
  return match ? match[1] : '';
}

function parseServices(text) {
  const services = [];
  const serviceRegex = /^\s*service\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^\s*\}/gm;
  let serviceMatch;
  while ((serviceMatch = serviceRegex.exec(text)) !== null) {
    const [, serviceName, body] = serviceMatch;
    const methods = [];
    const rpcRegex = /^\s*rpc\s+([A-Za-z0-9_]+)\s*\(\s*(stream\s+)?([^\s)]+)\s*\)\s+returns\s+\(\s*(stream\s+)?([^\s)]+)\s*\)\s*;/gm;
    let rpcMatch;
    while ((rpcMatch = rpcRegex.exec(body)) !== null) {
      methods.push({
        methodName: rpcMatch[1],
        requestStream: Boolean(rpcMatch[2]),
        requestType: rpcMatch[3],
        responseStream: Boolean(rpcMatch[4]),
        responseType: rpcMatch[5],
        capabilityCode: rpcMatch[1],
      });
    }
    services.push({ serviceName, methods });
  }
  return services;
}

function inferEntityName(protoFile, services) {
  if (services.length > 0) {
    const firstMethod = services[0].methods[0];
    if (firstMethod?.responseType) {
      return firstMethod.responseType;
    }
  }
  const base = path.basename(protoFile, '.proto');
  return base.endsWith('_service') ? base.slice(0, -'_service'.length) : base;
}

const manifest = {
  generatedAt: new Date().toISOString(),
  protoRoot,
  packages: {},
};

for (const protoFile of walk(protoRoot)) {
  const text = fs.readFileSync(protoFile, 'utf8');
  const packageName = parsePackage(text);
  if (!packageName) continue;

  const goPackage = parseGoPackage(text);
  const services = parseServices(text);
  const relativePath = path.relative(protoRoot, protoFile).replaceAll(path.sep, '/');
  const packageBucket = manifest.packages[packageName] ??= {
    goPackage,
    files: [],
    entities: {},
  };
  packageBucket.files.push(relativePath);

  const entityName = inferEntityName(protoFile, services);
  packageBucket.entities[entityName] ??= {
    protoFile: relativePath,
    services: {},
  };
  for (const service of services) {
    packageBucket.entities[entityName].services[service.serviceName] = service.methods;
  }
}

fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outFile}`);
