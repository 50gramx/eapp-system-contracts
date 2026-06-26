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

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function pascalCase(input) { return input.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(''); }
function dartImportPath(packageName, fileName) { return `package:eapp_dart_domain/ethos/${packageName.replaceAll('.', '/')}/${fileName}`; }
function dartReqType(methods, fallback) { return (methods[0]?.requestType?.split('.').pop() || fallback); }
function dartResType(methods, fallback) { return (methods[0]?.responseType?.split('.').pop() || fallback); }

function makeDartImplFile(packageName, entityName, serviceName, methods) {
  const entityPascal = pascalCase(entityName);
  const servicePascal = pascalCase(serviceName);
  const svcImport = dartImportPath(packageName, `${serviceName}.pbgrpc.dart`);
  const entImport = dartImportPath(packageName, `entities.pb.dart`);
  const reqType = dartReqType(methods, 'EAMV8002');
  const resType = dartResType(methods, 'EAMV8001');
  const className = `${entityPascal}${servicePascal}Implementation`;

  const methodsCode = methods.map(method => {
    const cap = method.capabilityCode || method.methodName;
    const req = method.requestType?.split('.').pop() || reqType;
    const res = method.responseType?.split('.').pop() || resType;
    const isClient = !!method.requestStream && !method.responseStream;
    const isServer = !method.requestStream && !!method.responseStream;
    const isBidi = !!method.requestStream && !!method.responseStream;
    if (isBidi) return `  @override\n  Stream<$res> ${method.methodName}(ServiceCall call, Stream<$req> request) async* {\n    // TODO: implement ${cap} using contract data and application logic.\n    throw UnimplementedError('UNIMPLEMENTED: ${cap}');\n  }\n`;
    if (isClient) return `  @override\n  Future<$res> ${method.methodName}(ServiceCall call, Stream<$req> request) async {\n    // TODO: implement ${cap} using contract data and application logic.\n    throw UnimplementedError('UNIMPLEMENTED: ${cap}');\n  }\n`;
    if (isServer) return `  @override\n  Stream<$res> ${method.methodName}(ServiceCall call, $req request) async* {\n    // TODO: implement ${cap} using contract data and application logic.\n    throw UnimplementedError('UNIMPLEMENTED: ${cap}');\n  }\n`;
    return `  @override\n  Future<$res> ${method.methodName}(ServiceCall call, $req request) async {\n    // TODO: implement ${cap} using contract data and application logic.\n    throw UnimplementedError('UNIMPLEMENTED: ${cap}');\n  }\n`;
  }).join('\n');

  return `// GENERATED CODE - DO NOT MODIFY BY HAND.\n// Generated from system-contracts consumer-registry-manifest.json.\n\nimport 'package:grpc/grpc.dart';\nimport '${svcImport}';\nimport '${entImport}';\n\nclass ${className} extends ${servicePascal}Base {\n${methodsCode}}\n`;
}

function makeDartHandlerFile(entityName, serviceName, className) {
  const entityPascal = pascalCase(entityName);
  const servicePascal = pascalCase(serviceName);
  return `// GENERATED CODE - DO NOT MODIFY BY HAND.\n// Generated from system-contracts consumer-registry-manifest.json.\n\nimport 'package:grpc/grpc.dart';\nimport '${className}.dart';\n\nvoid register${entityPascal}${servicePascal}(Server server) {\n  server.addService(${className}());\n}\n`;
}

function makeGoImplFile(packageName, entityName, serviceName, methods) {
  const entityPascal = pascalCase(entityName);
  const servicePascal = pascalCase(serviceName);
  const svcImport = `github.com/50gramx/eapp-golang-domain/${packageName.replaceAll('.', '/')}/services`;
  const entImport = `github.com/50gramx/eapp-golang-domain/${packageName.replaceAll('.', '/')}/entities`;
  const req = methods[0]?.requestType?.split('.').pop() || 'EAMV8002';
  const res = methods[0]?.responseType?.split('.').pop() || 'EAMV8001';
  return `package generated\n\nimport (\n\tcontext \"context\"\n\n\tentities \"${entImport}\"\n\tservices \"${svcImport}\"\n)\n\n// Generated from system-contracts consumer-registry-manifest.json.\ntype ${entityPascal}${servicePascal}Server struct {\n\tservices.Unimplemented${servicePascal}Server\n}\n\nvar _ services.${servicePascal}Server = (*${entityPascal}${servicePascal}Server)(nil)\n\nfunc (s *${entityPascal}${servicePascal}Server) EAMC8001(ctx context.Context, request *entities.${req}) (*entities.${res}, error) {\n\treturn nil, services.Unimplemented${servicePascal}Server{}.EAMC8001(ctx, request)\n}\n`;
}

for (const [packageName, packageEntry] of Object.entries(manifest.packages || {})) {
  for (const [entityName, entityEntry] of Object.entries(packageEntry.entities || {})) {
    for (const [serviceName, methods] of Object.entries(entityEntry.services || {})) {
      const packagePath = packageName.replaceAll('.', '/');
      const targetDir = path.join(outRoot, packagePath);
      ensureDir(targetDir);
      if (repoKind === 'dart') {
        const className = `${pascalCase(entityName)}${pascalCase(serviceName)}Implementation`;
        fs.writeFileSync(path.join(targetDir, `${className}.dart`), makeDartImplFile(packageName, entityName, serviceName, methods), 'utf8');
        fs.writeFileSync(path.join(targetDir, `handler.dart`), makeDartHandlerFile(entityName, serviceName, className), 'utf8');
      } else {
        fs.writeFileSync(path.join(targetDir, `${entityName}_${serviceName}.go`), makeGoImplFile(packageName, entityName, serviceName, methods), 'utf8');
      }
    }
  }
}

if (repoKind === 'dart') {
  const regDir = path.resolve(targetRoot, 'lib/src/registry');
  ensureDir(regDir);
  fs.writeFileSync(path.join(regDir, 'generated_implementation_registry.g.dart'), `// GENERATED CODE - DO NOT MODIFY BY HAND.\n// ignore_for_file: type=lint\n\nimport 'package:grpc/grpc.dart';\n\nclass GeneratedImplementationRegistry {\n  static void registerAll(Server server) {\n    // Generated handlers are discovered per package path.\n  }\n}\n`, 'utf8');
}

console.log(`Generated ${repoKind} implementation scaffold from ${manifestPath} into ${outRoot}`);
