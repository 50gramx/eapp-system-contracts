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

function makePeerClient() {
  return `package peerclient

import (
\t"context"
\t"crypto/tls"
\t"fmt"
\t"net"
\t"os"
\t"path/filepath"
\t"time"

\tpeerentities "github.com/50gramx/eapp-golang-domain/community/apps/gramx/fifty/zero/epn/epn_peers/entities"
\tpeerservices "github.com/50gramx/eapp-golang-domain/community/apps/gramx/fifty/zero/epn/epn_peers/services"
\t"google.golang.org/grpc"
\t"google.golang.org/grpc/credentials"
\t"google.golang.org/grpc/credentials/insecure"
\t"gopkg.in/yaml.v3"
)

type Config struct {
\tHost       string \`yaml:"host"\`
\tPort       int    \`yaml:"port"\`
\tInsecure   bool   \`yaml:"insecure"\`
\tServerName string \`yaml:"server_name"\`
}

type fileConfig struct {
\tPeerMesh Config \`yaml:"peer_mesh"\`
}

func DefaultConfig() Config { return Config{Host: "127.0.0.1", Port: 50051, Insecure: true, ServerName: "epn-peers"} }

func LoadConfig(path string) (Config, error) {
\tdata, err := os.ReadFile(filepath.Clean(path))
\tif err != nil { return Config{}, err }
\tcfg := fileConfig{PeerMesh: DefaultConfig()}
\tif err := yaml.Unmarshal(data, &cfg); err != nil { return Config{}, err }
\tif cfg.PeerMesh.Host == "" { cfg.PeerMesh.Host = "127.0.0.1" }
\tif cfg.PeerMesh.Port == 0 { cfg.PeerMesh.Port = 50051 }
\tif cfg.PeerMesh.ServerName == "" { cfg.PeerMesh.ServerName = "epn-peers" }
\treturn cfg.PeerMesh, nil
}

func (c Config) Address() string { return net.JoinHostPort(c.Host, fmt.Sprintf("%d", c.Port)) }

func Dial(ctx context.Context, cfg Config) (*grpc.ClientConn, error) {
\topts := []grpc.DialOption{grpc.WithBlock()}
\tif cfg.Insecure {
\t\topts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
\t} else {
\t\tcreds := credentials.NewTLS(&tls.Config{ServerName: cfg.ServerName, MinVersion: tls.VersionTLS12})
\t\topts = append(opts, grpc.WithTransportCredentials(creds))
\t}
\tctx, cancel := context.WithTimeout(ctx, 10*time.Second)
\tdefer cancel()
\treturn grpc.DialContext(ctx, cfg.Address(), opts...)
}

type Client struct {
\tconn     *grpc.ClientConn
\tidentity peerservices.EAMV7101DiscoverServiceClient
\tpeers    peerservices.EAMV7103DiscoverServiceClient
\tconnect  peerservices.EAMV7105DiscoverServiceClient
\tfind     peerservices.EAMV7107DiscoverServiceClient
}

func New(ctx context.Context, cfg Config) (*Client, error) {
\tconn, err := Dial(ctx, cfg)
\tif err != nil { return nil, err }
\treturn &Client{
\t\tconn:     conn,
\t\tidentity: peerservices.NewEAMV7101DiscoverServiceClient(conn),
\t\tpeers:    peerservices.NewEAMV7103DiscoverServiceClient(conn),
\t\tconnect:  peerservices.NewEAMV7105DiscoverServiceClient(conn),
\t\tfind:     peerservices.NewEAMV7107DiscoverServiceClient(conn),
\t}, nil
}

func (c *Client) Close() error {
\tif c == nil || c.conn == nil { return nil }
\treturn c.conn.Close()
}

func (c *Client) LoadIdentity(ctx context.Context, scope string) (*peerentities.EAMV7101, error) {
\tstream, err := c.identity.EAMC7101(ctx)
\tif err != nil { return nil, err }
\tif err := stream.Send(&peerentities.EAMV7100{Eamvt7100: scope}); err != nil { return nil, err }
\treturn stream.CloseAndRecv()
}

func (c *Client) LoadPeers(ctx context.Context, scope string) (*peerentities.EAMV7103, error) {
\tstream, err := c.peers.EAMC7102(ctx)
\tif err != nil { return nil, err }
\tif err := stream.Send(&peerentities.EAMV7100{Eamvt7100: scope}); err != nil { return nil, err }
\treturn stream.CloseAndRecv()
}

func (c *Client) ConnectPeer(ctx context.Context, multiaddr string) (*peerentities.EAMV7105, error) {
\tstream, err := c.connect.EAMC7103(ctx)
\tif err != nil { return nil, err }
\tif err := stream.Send(&peerentities.EAMV7104{Eamvt7112: multiaddr}); err != nil { return nil, err }
\treturn stream.CloseAndRecv()
}

func (c *Client) FindPeerByDID(ctx context.Context, did string) (*peerentities.EAMV7107, error) {
\tstream, err := c.find.EAMC7104(ctx)
\tif err != nil { return nil, err }
\tif err := stream.Send(&peerentities.EAMV7106{Eamvt7116: did}); err != nil { return nil, err }
\treturn stream.CloseAndRecv()
}
`;
}

function makeMeshClient() {
  return `package meshclient

import (
\t"context"
\t"crypto/tls"
\t"fmt"
\t"net"
\t"os"
\t"path/filepath"
\t"time"

\tentities "github.com/50gramx/eapp-golang-domain/community/apps/gramx/fifty/zero/ethos/mesh_demo/entities"
\tservices "github.com/50gramx/eapp-golang-domain/community/apps/gramx/fifty/zero/ethos/mesh_demo/services"
\t"google.golang.org/grpc"
\t"google.golang.org/grpc/credentials"
\t"google.golang.org/grpc/credentials/insecure"
\t"gopkg.in/yaml.v3"
)

type Config struct {
\tHost       string \`yaml:"host"\`
\tPort       int    \`yaml:"port"\`
\tInsecure   bool   \`yaml:"insecure"\`
\tServerName string \`yaml:"server_name"\`
}

type fileConfig struct {
\tMeshDemo Config \`yaml:"mesh_demo"\`
}

func DefaultConfig() Config { return Config{Host: "127.0.0.1", Port: 50052, Insecure: true, ServerName: "mesh-demo"} }

func LoadConfig(path string) (Config, error) {
\tdata, err := os.ReadFile(filepath.Clean(path))
\tif err != nil { return Config{}, err }
\tcfg := fileConfig{MeshDemo: DefaultConfig()}
\tif err := yaml.Unmarshal(data, &cfg); err != nil { return Config{}, err }
\tif cfg.MeshDemo.Host == "" { cfg.MeshDemo.Host = "127.0.0.1" }
\tif cfg.MeshDemo.Port == 0 { cfg.MeshDemo.Port = 50052 }
\tif cfg.MeshDemo.ServerName == "" { cfg.MeshDemo.ServerName = "mesh-demo" }
\treturn cfg.MeshDemo, nil
}

func (c Config) Address() string { return net.JoinHostPort(c.Host, fmt.Sprintf("%d", c.Port)) }

func Dial(ctx context.Context, cfg Config) (*grpc.ClientConn, error) {
\topts := []grpc.DialOption{grpc.WithBlock()}
\tif cfg.Insecure {
\t\topts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
\t} else {
\t\tcreds := credentials.NewTLS(&tls.Config{ServerName: cfg.ServerName, MinVersion: tls.VersionTLS12})
\t\topts = append(opts, grpc.WithTransportCredentials(creds))
\t}
\tctx, cancel := context.WithTimeout(ctx, 10*time.Second)
\tdefer cancel()
\treturn grpc.DialContext(ctx, cfg.Address(), opts...)
}

type Client struct {
\tconn *grpc.ClientConn
\tmesh services.EAMV8001DiscoverServiceClient
}

func New(ctx context.Context, cfg Config) (*Client, error) {
\tconn, err := Dial(ctx, cfg)
\tif err != nil { return nil, err }
\treturn &Client{conn: conn, mesh: services.NewEAMV8001DiscoverServiceClient(conn)}, nil
}

func (c *Client) Close() error {
\tif c == nil || c.conn == nil { return nil }
\treturn c.conn.Close()
}

func (c *Client) EAMC8001(ctx context.Context, request *entities.EAMV8002) (*entities.EAMV8001, error) {
\treturn c.mesh.EAMC8001(ctx, request)
}

func (c *Client) EAMC8002(ctx context.Context, request *entities.EAMV8002) (*entities.EAMV8001, error) {
\tstream, err := c.mesh.EAMC8002(ctx)
\tif err != nil { return nil, err }
\tif err := stream.Send(request); err != nil { return nil, err }
\treturn stream.CloseAndRecv()
}

func (c *Client) EAMC8003(ctx context.Context, request *entities.EAMV8002) (services.EAMV8001DiscoverService_EAMC8003Client, error) {
\treturn c.mesh.EAMC8003(ctx, request)
}

func (c *Client) EAMC8004(ctx context.Context) (services.EAMV8001DiscoverService_EAMC8004Client, error) {
\treturn c.mesh.EAMC8004(ctx)
}
`;
}

for (const [packageName] of Object.entries(manifest.packages || {})) {
  const base = path.join(outRoot, packageName.includes('mesh_demo') ? 'meshclient' : 'peerclient');
  if (packageName.includes('mesh_demo')) {
    write(path.join(base, 'client.go'), makeMeshClient());
  } else if (packageName.includes('epn_peers')) {
    write(path.join(base, 'client.go'), makePeerClient());
  }
}

console.log(`Generated Go consumer clients from ${manifestPath} into ${outRoot}`);
