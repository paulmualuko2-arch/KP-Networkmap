# BDIV10 Web Map (Leaflet)

This folder contains a simple offline web map that visualizes:
- MV lines: `mv_lines.geojson`
- Transformers: `transformers.geojson`

## How to run (important)
Browsers block `fetch()` when you open `index.html` directly from disk.
Run a small local web server in this folder:

### Option A (Python)
```bash
cd bdiv10_webmap
python -m http.server 8000
```
Then open:
http://localhost:8000

### Option B (VS Code)
Install "Live Server" extension and click **Go Live**.

## Search
- Search works across transformer Name/No and feeder names.
- Use the feeder dropdown to filter and highlight a feeder.


## Added features
- Map legend (bottom-right)
- Search suggestions (type at least 2 characters)
- Feeder-only search mode (toggle under the search box)
- “Zoom to feeder” button (uses full feeder extent)
