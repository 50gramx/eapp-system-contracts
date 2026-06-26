import fs from 'node:fs';
import path from 'node:path';

const manifestPath = process.argv[2] || 'consumer-registry-manifest.json';
const targetRoot = process.argv[3];

if (!targetRoot) {
  throw new Error('Usage: node tool/generate-go-consumer.mjs <manifest> <target-root>');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outRoot = path.resolve(targetRoot);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, 'utf8');
}

function getClientDirAndPackage(packageName) {
  if (packageName.includes('mesh_demo')) {
    return { dirName: 'meshclient', pkgName: 'meshclient' };
  }
  if (packageName.includes('epn_peers')) {
    return { dirName: 'peerclient', pkgName: 'peerclient' };
  }
  const lastPart = packageName.split('.').pop();
  const pkgName = lastPart.replace(/_/g, '') + 'client';
  return { dirName: pkgName, pkgName };
}

// Generate clients for each package in the manifest
for (const [packageName, packageData] of Object.entries(manifest.packages || {})) {
  const { dirName, pkgName } = getClientDirAndPackage(packageName);
  const base = path.join(outRoot, dirName);
  
  const goPackagePath = packageName.replace(/\./g, '/');
  const entitiesImport = `github.com/50gramx/eapp-golang-domain/${goPackagePath}/entities`;
  const servicesImport = `github.com/50gramx/eapp-golang-domain/${goPackagePath}/services`;
  
  const clientFields = [];
  const clientInits = [];
  const methods = [];
  
  for (const [entityCode, entityData] of Object.entries(packageData.entities || {})) {
    for (const [serviceName, capList] of Object.entries(entityData.services || {})) {
      const fieldName = `client${entityCode}`;
      clientFields.push(`\t${fieldName} services.${serviceName}Client`);
      clientInits.push(`\t\t${fieldName}: services.New${serviceName}Client(conn),`);
      
      for (const cap of capList) {
        const { methodName, requestType, responseType, requestStream, responseStream } = cap;
        
        let methodSig = '';
        let methodBody = '';
        
        if (!requestStream && !responseStream) {
          // Unary
          methodSig = `func (c *Client) ${methodName}(ctx context.Context, request *entities.${requestType}) (*entities.${responseType}, error)`;
          methodBody = `\treturn c.${fieldName}.${methodName}(ctx, request)`;
        } else if (requestStream && !responseStream) {
          // Client streaming
          methodSig = `func (c *Client) ${methodName}(ctx context.Context, request *entities.${requestType}) (*entities.${responseType}, error)`;
          methodBody = `\tstream, err := c.${fieldName}.${methodName}(ctx)
\tif err != nil { return nil, err }
\tif err := stream.Send(request); err != nil { return nil, err }
\treturn stream.CloseAndRecv()`;
        } else if (!requestStream && responseStream) {
          // Server streaming
          methodSig = `func (c *Client) ${methodName}(ctx context.Context, request *entities.${requestType}) (services.${serviceName}_${methodName}Client, error)`;
          methodBody = `\treturn c.${fieldName}.${methodName}(ctx, request)`;
        } else if (requestStream && responseStream) {
          // Bidirectional streaming
          methodSig = `func (c *Client) ${methodName}(ctx context.Context) (services.${serviceName}_${methodName}Client, error)`;
          methodBody = `\treturn c.${fieldName}.${methodName}(ctx)`;
        }
        
        methods.push(`${methodSig} {\n${methodBody}\n}`);
      }
    }
  }
  
  const clientGoContent = `package ${pkgName}

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	entities "${entitiesImport}"
	services "${servicesImport}"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Host       string \`yaml:"host"\`
	Port       int    \`yaml:"port"\`
	Insecure   bool   \`yaml:"insecure"\`
	ServerName string \`yaml:"server_name"\`
}

type fileConfig struct {
	MeshConfig Config \`yaml:"mesh_config"\`
}

func DefaultConfig() Config { return Config{Host: "127.0.0.1", Port: 50051, Insecure: true, ServerName: "${dirName}"} }

func LoadConfig(path string) (Config, error) {
	data, err := os.ReadFile(filepath.Clean(path))
	if err != nil { return Config{}, err }
	cfg := fileConfig{MeshConfig: DefaultConfig()}
	if err := yaml.Unmarshal(data, &cfg); err != nil { return Config{}, err }
	if cfg.MeshConfig.Host == "" { cfg.MeshConfig.Host = "127.0.0.1" }
	if cfg.MeshConfig.Port == 0 { cfg.MeshConfig.Port = 50051 }
	if cfg.MeshConfig.ServerName == "" { cfg.MeshConfig.ServerName = "${dirName}" }
	return cfg.MeshConfig, nil
}

func (c Config) Address() string { return net.JoinHostPort(c.Host, fmt.Sprintf("%d", c.Port)) }

func Dial(ctx context.Context, cfg Config) (*grpc.ClientConn, error) {
	opts := []grpc.DialOption{grpc.WithBlock()}
	if cfg.Insecure {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	} else {
		creds := credentials.NewTLS(&tls.Config{ServerName: cfg.ServerName, MinVersion: tls.VersionTLS12})
		opts = append(opts, grpc.WithTransportCredentials(creds))
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return grpc.DialContext(ctx, cfg.Address(), opts...)
}

type Client struct {
	conn *grpc.ClientConn
${clientFields.join('\n')}
}

func New(ctx context.Context, cfg Config) (*Client, error) {
	conn, err := Dial(ctx, cfg)
	if err != nil { return nil, err }
	return &Client{
		conn: conn,
${clientInits.join('\n')}
	}, nil
}

func (c *Client) Close() error {
	if c == nil || c.conn == nil { return nil }
	return c.conn.Close()
}

${methods.join('\n\n')}
`;

  write(path.join(base, 'client.go'), clientGoContent);
}

console.log(`Generated Go consumer clients from ${manifestPath} into ${outRoot}`);
