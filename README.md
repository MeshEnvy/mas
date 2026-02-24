# Mesh Asset Server

The Mesh Asset Server is an MIT asset server to side-load asset blobs for LoRa Mesh clients.

By default, assets are stored for 30 days.

The server will accept any asset blob up to 10MB. The assets are treated as opaque blobs, so it is your responsbility to handle encryption/decryption and storing the content type of the asset in the blob itself. 

For security, MAS does *not* track the asset type. Everything is treated as an opaque blob.

**Official Endpoint**

https://mas.meshenvy.org/

## API

### POST /

Upload a blob to the server. The server will return a short hash of the blob.

```http
POST / HTTP/1.1
Host: mas.meshenvy.org
Content-Type: application/octet-stream

<blob-data>
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
    "hash": "9cdc4d"
}
```

### GET /:hash

Fetch a blob from the server.

```http
GET /9cdc4d HTTP/1.1
Host: mas.meshenvy.org
```

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream

<blob-data>
```