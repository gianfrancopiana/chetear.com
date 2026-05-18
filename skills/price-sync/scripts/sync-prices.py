#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_URL = "https://www.precios.uy/sipc2Web/recursos/sipc/"
OUTPUT_PATH = Path(__file__).resolve().parents[3] / "site/src/data/prices/chain-prices.json"
BBOX = {"v1": -58, "v2": -35.5, "v3": -53, "v4": -30}
HEADERS = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.precios.uy/sipc2Web/",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
}
POST_HEADERS = {
    **HEADERS,
    "Content-Type": "application/json",
}
MAX_WORKERS = 4
RETRIES = 3
TIMEOUT = 60


def fetch_json(endpoint: str, payload: dict | None = None):
    url = f"{BASE_URL}{endpoint}"
    data = None
    headers = HEADERS
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers = POST_HEADERS
    last_error = None
    for attempt in range(RETRIES):
        try:
            req = Request(url, data=data, headers=headers)
            with urlopen(req, timeout=TIMEOUT) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt + 1 < RETRIES:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed {endpoint}: {last_error}")


def normalize_space(value: str) -> str:
    return " ".join((value or "").replace("\xa0", " ").split())


# Maps the source-API unit words (e.g. "Mililitros") to the short form used in
# the UI ("ml"). The source emits "900.0 Mililitros", "2.0 Litros" etc.; we want
# "900 ml", "2 L", "2,25 L" (es-UY uses comma as decimal separator).
_UNIT_ABBREV = {
    "mililitros": "ml",
    "mililitro": "ml",
    "ml": "ml",
    "litros": "L",
    "litro": "L",
    "l": "L",
    "gramos": "g",
    "gramo": "g",
    "g": "g",
    "kilogramos": "kg",
    "kilogramo": "kg",
    "kg": "kg",
    "unidades": "u",
    "unidad": "u",
    "u": "u",
    "metros": "m",
    "metro": "m",
    "m": "m",
}


_NUMBER_UNIT_RE = re.compile(r"(\d+(?:[\.,]\d+)?)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)")


def _format_number(number_text: str) -> str:
    number = float(number_text.replace(",", "."))
    if number.is_integer():
        return str(int(number))
    # es-UY decimals: "2,25"
    return f"{number:g}".replace(".", ",")


def normalize_unit(value: str) -> str:
    text = normalize_space(value)
    if not text:
        return ""

    def replace(match: "re.Match[str]") -> str:
        number_display = _format_number(match.group(1))
        word = match.group(2)
        unit_display = _UNIT_ABBREV.get(word.lower(), word)
        return f"{number_display} {unit_display}"

    # Normalize every "<number> <word>" pair in the string. Handles both the
    # common "900.0 Mililitros" form and prefixed forms like
    # "Botella 2.0 Litros" -> "Botella 2 L".
    return _NUMBER_UNIT_RE.sub(replace, text)


def chain_label_from_store_name(name: str) -> str:
    value = normalize_space(name)
    if "- Suc." in value:
        value = value.split("- Suc.", 1)[0]
    return value.strip(" -") or value


def normalized_label_key(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return normalize_space(folded).casefold()


_slug_re = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    folded = folded.lower().replace("&", " and ")
    slug = _slug_re.sub("-", folded).strip("-")
    return slug or "store"


def parse_price(value: str):
    text = normalize_space(value)
    offer = "oferta" in text.casefold()
    match = re.search(r"(\d+(?:[\.,]\d+)?)", text)
    if not match:
        raise ValueError(f"Could not parse price from {value!r}")
    number = float(match.group(1).replace(",", "."))
    if number.is_integer():
        number = int(number)
    return number, offer


OUTPUT_EXISTS = OUTPUT_PATH.exists()
existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8")) if OUTPUT_EXISTS else {}
existing_chain_labels = {row["id"]: row["label"] for row in existing.get("chains", [])}
existing_updated_at = {row["id"]: row.get("updatedAt") for row in existing.get("items", [])}


def parse_source_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%d/%m/%y")
    except ValueError:
        return None

articles = fetch_json("obtenerArticulos")
establishments = fetch_json("obtenerEstablecimientos")

chain_id_to_label: dict[str, str] = dict(existing_chain_labels)
chain_key_to_id: dict[str, str] = {
    normalized_label_key(label): chain_id
    for chain_id, label in chain_id_to_label.items()
}
used_chain_ids = set(chain_id_to_label)
establishment_chain_ids: dict[int, str] = {}


def assign_chain(label: str) -> str:
    label = normalize_space(label)
    key = normalized_label_key(label)
    existing_id = chain_key_to_id.get(key)
    if existing_id:
        if existing_id not in chain_id_to_label:
            chain_id_to_label[existing_id] = existing_chain_labels.get(existing_id, label)
        return existing_id

    base = slugify(label)
    candidate = base
    suffix = 2
    while candidate in used_chain_ids and normalized_label_key(chain_id_to_label[candidate]) != key:
        candidate = f"{base}-{suffix}"
        suffix += 1

    used_chain_ids.add(candidate)
    chain_key_to_id[key] = candidate
    chain_id_to_label[candidate] = label
    return candidate


for store in establishments:
    label = chain_label_from_store_name(store.get("name", ""))
    establishment_chain_ids[int(store["id"])] = assign_chain(label)


def fetch_article_prices(article: dict):
    article_id = int(article["id"])
    rows = fetch_json("compararArticulo", {"id_articulo": str(article_id), **BBOX})
    best: dict[str, dict] = {}
    for row in rows:
        store_id = int(row["id"])
        chain_id = establishment_chain_ids.get(store_id)
        if not chain_id:
            chain_id = assign_chain(chain_label_from_store_name(row.get("name", "")))
            establishment_chain_ids[store_id] = chain_id
        price, offer = parse_price(row.get("precio", ""))
        candidate = {
            "chainId": chain_id,
            "price": price,
            "offer": offer,
            "date": row.get("fecha"),
            "storeId": store_id,
        }
        current = best.get(chain_id)
        if current is None:
            best[chain_id] = candidate
            continue
        if price < current["price"]:
            best[chain_id] = candidate
            continue
        if price == current["price"]:
            if offer and not current["offer"]:
                best[chain_id] = candidate
                continue
            if offer == current["offer"] and store_id < current["storeId"]:
                best[chain_id] = candidate

    best_rows = [best[key] for key in sorted(best)]
    if not best_rows:
        return None

    dates = [row.get("date") for row in best_rows if row.get("date")]
    dated_rows = [(parse_source_date(date), date) for date in dates]
    dated_rows = [(parsed, date) for parsed, date in dated_rows if parsed is not None]
    updated_at = max(dated_rows, key=lambda pair: pair[0])[1] if dated_rows else existing_updated_at.get(article_id)

    item = {
        "id": article_id,
        "name": normalize_space(article.get("name", "")),
        "unit": normalize_unit(article.get("unidad", "")),
        "updatedAt": updated_at,
        "bestByChain": best_rows,
    }
    return item


items: list[dict] = []
with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    futures = {executor.submit(fetch_article_prices, article): article for article in articles}
    for future in as_completed(futures):
        item = future.result()
        if item is not None:
            items.append(item)

items.sort(key=lambda row: row["id"])
used_item_chain_ids = {entry["chainId"] for item in items for entry in item["bestByChain"]}
chains = [
    {"id": chain_id, "label": chain_id_to_label[chain_id]}
    for chain_id in sorted(used_item_chain_ids, key=lambda cid: normalized_label_key(chain_id_to_label[cid]))
]

payload = {
    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "source": {"baseUrl": BASE_URL, "bbox": BBOX},
    "counts": {"articles": len(articles), "establishments": len(establishments)},
    "chains": chains,
    "items": items,
}

new_text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
comparable_payload = dict(payload)
comparable_payload["generatedAt"] = existing.get("generatedAt") if OUTPUT_EXISTS else None

if OUTPUT_EXISTS and existing == comparable_payload:
    print("UNCHANGED")
    sys.exit(0)

OUTPUT_PATH.write_text(new_text, encoding="utf-8")
print("UPDATED")
