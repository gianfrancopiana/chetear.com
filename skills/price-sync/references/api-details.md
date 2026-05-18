# precios.uy API Reference

Base URL: `https://www.precios.uy/sipc2Web/recursos/sipc/`

No authentication required. No rate limiting observed.

## GET obtenerArticulos

Returns all tracked products.

Note: raw requests now return `406 Not Acceptable` unless you send the same XHR-style headers the web app uses.

```json
[
  {
    "unidad": " 900.0 Mililitros",
    "name": "Aceite de girasol - Optimo",
    "imagen": "7209.png",
    "id": 1,
    "cantidad": 1,
    "desc": ""
  }
]
```

## GET obtenerEstablecimientos

Returns all establishments with geo data (name, address, lat/lng, chain).

## POST compararArticulo

Returns current prices for a product across all establishments within a
geographic bounding box.

Headers:
- `Accept: application/json, text/javascript, */*; q=0.01`
- `X-Requested-With: XMLHttpRequest`
- `Referer: https://www.precios.uy/sipc2Web/`
- browser-like `User-Agent`
- `Content-Type: application/json`

Body:
```json
{
  "id_articulo": "16",
  "v1": -58,
  "v2": -35.5,
  "v3": -53,
  "v4": -30
}
```

- `id_articulo`: string, the product ID from obtenerArticulos
- `v1-v4`: bounding box. Use `v1=-58, v2=-35.5, v3=-53, v4=-30` for all Uruguay.

Response:
```json
[
  {
    "css": "G",
    "direccion": "...",
    "fecha": "07/03/26",
    "precio": "$47.0",
    "marker": "green_usd",
    "name": "El Mastilazo- Suc. El Mastilazo",
    "x": -34.726,
    "y": -56.210,
    "localidad": "Las Piedras, CANELONES",
    "tel": "23651368",
    "id": 1710014
  }
]
```

- `precio`: either `"$XX.X"` or `"oferta - $XX.X"` for sale items
- `marker`: green_usd (cheapest), green_diamond (offer/cheapest), olive (cheap),
  blue (intermediate), red (expensive)
- `fecha`: date of report in DD/MM/YY format
- Data is daily

## Endpoints that return 501

These work through the Vue app UI but return 501 via direct fetch (Apache proxy
blocks them). Not needed:

- `compararCanasta`
- `compararPrecios`
- `obtenerDeclaracion`
- `obtenerDeclarantes`
