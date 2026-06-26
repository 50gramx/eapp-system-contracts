import fs from 'node:fs';
import path from 'node:path';

const manifestPath = process.argv[2] || 'consumer-registry-manifest.json';
const targetRoot = process.argv[3];
const repoKind = process.argv[4] || 'dart';

if (!targetRoot) {
  throw new Error('Usage: node tool/generate-implementation-scaffold.mjs <manifest> <target-root> <dart|go>');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outRoot = path.resolve(targetRoot, repoKind === 'go' ? 'server/generated' : 'lib/src/generated');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pascalCase(input) {
  return input
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function makeStubFile(entityName, serviceName, methods) {
  const servicePascal = pascalCase(serviceName);
  const entityPascal = pascalCase(entityName);

  if (repoKind === 'go') {
    const methodComments = methods.map(method => {
      const capabilityCode = method.capabilityCode || method.methodName;
      return `// TODO: replace this placeholder with the actual implementation for ${capabilityCode}.`;
    }).join('\n');

    return `package generated

// Generated from system-contracts consumer-registry-manifest.json.
// TODO: wire actual service behavior in the implementation layer.
type ${entityPascal}${servicePascal}Server struct{}

${methodComments}
`;
  }

  return `// GENERATED CODE - DO NOT MODIFY BY HAND.
// Generated from system-contracts consumer-registry-manifest.json.

class ${entityPascal}${servicePascal}Server {
${methods.map(method => `  // TODO: replace this placeholder with the actual implementation for ${method.capabilityCode || method.methodName}.
  String ${method.methodName}() => 'UNIMPLEMENTED: ${method.capabilityCode || method.methodName}';
`).join('\n')}
}
`;
}

for (const [packageName, packageEntry] of Object.entries(manifest.packages || {})) {
  for (const [entityName, entityEntry] of Object.entries(packageEntry.entities || {})) {
    for (const [serviceName, methods] of Object.entries(entityEntry.services || {})) {
      const packagePath = packageName.replaceAll('.', '/');
      const targetDir = path.join(outRoot, packagePath);
      ensureDir(targetDir);
      const fileName = repoKind === 'go'
        ? `${entityName}_${serviceName}.go`
        : `${entityName}_${serviceName}.dart`;
      fs.writeFileSync(path.join(targetDir, fileName), makeStubFile(entityName, serviceName, methods), 'utf8');
    }
  }
}

console.log(`Generated ${repoKind} implementation scaffold from ${manifestPath} into ${outRoot}`);
