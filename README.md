# Mesh Asset Server

The Mesh Asset Server is an MIT asset server to side-load images for LoRa Mesh clients.

By default, assets are stored for 30 days.

The server supports the following input image formats:
- JPEG
- PNG
- GIF
- WebP
- AVIF
- TIFF

All images are converted to WebP for storage and delivery.

**Official Endpoint**

https://mas.meshenvy.org/

## API

### POST /

Upload an image to the server. The server will return a short hash of the image.

```http
POST / HTTP/1.1
Host: mas.meshenvy.org
Content-Type: image/jpeg

<image-data>
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
    "hash": "9cdc4d"
}
```

### GET /:hash

Fetch an image from the server.

```http
GET /9cdc4d HTTP/1.1
Host: mas.meshenvy.org
```

```http
HTTP/1.1 200 OK
Content-Type: image/webp

<image-data>
```