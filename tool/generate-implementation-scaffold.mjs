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

function dartImportPath(packageName, subdir, fileName) {
  return `package:eapp_dart_domain/ethos/${packageName.replaceAll('.', '/')}/${subdir}/${fileName}`;
}

function makeDartServiceFile(packageName, entityName, serviceName, methods) {
  const servicePascal = pascalCase(serviceName);
  const entityPascal = pascalCase(entityName);
  const serviceImport = dartImportPath(packageName, 'services', `${serviceName}.pbgrpc.dart`);
  const entitiesImport = dartImportPath(packageName, '', `entities.pb.dart`);
  const requestType = methods[0]?.requestType?.split('.').pop() || 'EAMV8002';
  const responseType = methods[0]?.responseType?.split('.').pop() || 'EAMV8001';

  const methodBodies = methods.map(method => {
    const capabilityCode = method.capabilityCode || method.methodName;
    const reqType = method.requestType?.split('.').pop() || requestType;
    const resType = method.responseType?.split('.').pop() || responseType;
    const isClientStream = Boolean(method.requestStream && !method.responseStream);
    const isServerStream = Boolean(!method.requestStream && method.responseStream);
    const isBidiStream = Boolean(method.requestStream && method.responseStream);

    if (isBidiStream) {
      return `  @override
  Stream<$resType> ${method.methodName}(ServiceCall call, Stream<$reqType> request) async* {
    // TODO: replace this contract-shaped shell with the real bidi implementation for ${capabilityCode}.
    // Keep the generated stub stable so business logic can be added later.
    throw UnimplementedError('UNIMPLEMENTED: ${capabilityCode}');
  }
`;
    }

    if (isClientStream) {
      return `  @override
  Future<$resType> ${method.methodName}(ServiceCall call, Stream<$reqType> request) async {
    // TODO: replace this contract-shaped shell with the real client-stream implementation for ${capabilityCode}.
    // Keep the generated stub stable so business logic can be added later.
    throw UnimplementedError('UNIMPLEMENTED: ${capabilityCode}');
  }
`;
    }

    if (isServerStream) {
      return `  @override
  Stream<$resType> ${method.methodName}(ServiceCall call, $reqType request) async* {
    // TODO: replace this contract-shaped shell with the real server-stream implementation for ${capabilityCode}.
    // Keep the generated stub stable so business logic can be added later.
    throw UnimplementedError('UNIMPLEMENTED: ${capabilityCode}');
  }
`;
    }

    return `  @override
  Future<$resType> ${method.methodName}(ServiceCall call, $reqType request) async {
    // TODO: replace this contract-shaped shell with the real unary implementation for ${capabilityCode}.
    // Keep the generated stub stable so business logic can be added later.
    throw UnimplementedError('UNIMPLEMENTED: ${capabilityCode}');
  }
`;
  }).join('\n');

  return `// GENERATED CODE - DO NOT MODIFY BY HAND.
// Generated from system-contracts consumer-registry-manifest.json.

import 'package:grpc/grpc.dart';
import '${serviceImport}';
import '${entitiesImport}';

class ${entityPascal}${servicePascal}Implementation extends ${servicePascal}Base {
${methodBodies}}
`;
}

function goImportPath(packageName, folder) {
  return `github.com/50gramx/eapp-golang-domain/${packageName.replaceAll('.', '/')}/${folder}`;
}

function makeGoServiceFile(packageName, entityName, serviceName, methods) {
  const servicePascal = pascalCase(serviceName);
  const entityPascal = pascalCase(entityName);
  const serviceImport = goImportPath(packageName, 'services');
  const entitiesImport = goImportPath(packageName, 'entities');

  const methodComments = methods.map(method => {
    const capabilityCode = method.capabilityCode || method.methodName;
    return `// TODO: replace this contract-shaped shell with the real implementation for ${capabilityCode}.`;
  }).join('\n');

  return `package generated

import (
	"context"

	entities "${entitiesImport}"
	services "${serviceImport}"
	grpc "google.golang.org/grpc"
)

// Generated from system-contracts consumer-registry-manifest.json.
// TODO: wire actual service behavior in the implementation layer.
type ${entityPascal}${servicePascal}Server struct {
	services.Unimplemented${servicePascal}Server
}

${methodComments}

var _ services.${servicePascal}Server = (*${entityPascal}${servicePascal}Server)(nil)

func (s *${entityPascal}${servicePascal}Server) EAMC8001(ctx context.Context, request *entities.${methods[0]?.requestType?.split('.').pop() || 'EAMV8002'}) (*entities.${methods[0]?.responseType?.split('.').pop() || 'EAMV8001'}, error) {
	return nil, grpc.Errorf(grpc.Code(grpc.Unimplemented), "UNIMPLEMENTED: ${methods[0]?.capabilityCode || 'EAMC8001'}")
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
      fs.writeFileSync(path.join(targetDir, fileName), repoKind === 'go'
        ? makeGoServiceFile(packageName, entityName, serviceName, methods)
        : makeDartServiceFile(packageName, entityName, serviceName, methods), 'utf8');
    }
  }
}

console.log(`Generated ${repoKind} implementation scaffold from ${manifestPath} into ${outRoot}`);
