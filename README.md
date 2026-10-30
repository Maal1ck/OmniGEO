# OmniGeo Desktop

A high-performance geospatial data processing workbench for reliable batch format conversion, coordinate reference system (CRS) transformation, visual validation, and large collections of spatial files.

---

## 1. Product Overview

OmniGeo provides a clean, modern, local-first processing workbench for GIS analysts, surveyors, cartographers, and engineering teams. It bridges the gap between ad-hoc command line GDAL scripts and bloated desktop GIS suites by focusing squarely on the core batch workflow:

**Import Data → Configure Conversion → Validate → Process Batch → Review Results → Export Manifest.**

### Supported Vector Formats
- **OGC GeoPackage (`.gpkg`)**: Standard SQLite spatial database with `gpkg_spatial_ref_sys`, `gpkg_contents`, and `gpkg_geometry_columns`.
- **ESRI Shapefile (`.zip`)**: Automated sidecar bundling (`.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`) with ESRI WKT projection definitions.
- **RFC 7946 GeoJSON (`.geojson`, `.json`)**: High-fidelity Web GIS standard.
- **Keyhole Markup Language (`.kml`, `.kmz`)**: Google Earth Placemarks, Polygons, and LineStrings with ExtendedData attributes.
- **Spatial CSV (`.csv`)**: Tabular export and ingestion with coordinate detection (`latitude`/`longitude`, `northing`/`easting`).

---

## 2. Key Architecture & Features

### 2.1 Batch Workspace
- **Drag-and-Drop Ingestion:** Accepts multiple files or folders.
- **Sidecar Intelligence:** Recognizes a Shapefile as an interdependent bundle (`.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`). Warns immediately when critical index (`.shx`) or table (`.dbf`) sidecars are missing.
- **Non-blocking Metadata Extraction:** Inspects geometry type, feature count, detected CRS, and coordinate bounds.
- **Filtering & Search:** Real-time search across file names, detected CRS, format pills, and validation status.

### 2.2 Conversion Lab
- **Target Format Engine:** One-click batch format targeting with customizable layer names.
- **Coordinate Reference System (CRS) Registry:** Searchable offline catalogue of more than 6,900 EPSG geographic and projected coordinate systems plus custom PROJ string definitions. Shapefile `.prj` detection uses the top-level authority identifier and preserves the source coordinate values.
- **Reproject vs. Assign CRS Distinction:**
  - *Reproject:* Calculates new coordinate coordinates via PROJ mathematical equations.
  - *Assign:* Metadata override only; preserves numerical coordinates without distortion.
- **Collision Protection:** Configurable auto-increment renaming (`{name}_1.gpkg`), safe overwrite with confirmation, or skip existing outputs.
- **Dry-Run Mode:** Full pre-flight audit that identifies naming collisions, unclosed rings, NaN coordinates, and format limitations without writing files to disk.

### 2.3 Interactive Map Preview & Attribute Inspection
- **Leaflet Vector Canvas:** Interactive map with pan, zoom to extent, and layer switching.
- **Basemap Engine:** Switch between Dark Minimalist, OpenStreetMap, Satellite, and a **100% Offline Spatial Grid** requiring zero internet requests.
- **Source vs. Output Comparison:** Overlay processed output geometries against source geometries to visually audit reprojection fidelity.
- **Tabular Attribute Inspector:** Sortable, searchable table viewer with column schema analysis and feature popups.

### 2.4 Batch Job Monitor & Reporting
- **Multi-threaded Worker Pool:** Configurable concurrency limit to protect system memory and disk I/O.
- **Per-file Pipeline Logging:** Detailed, timestamped execution steps (Inspect, CRS Transform, Validate, Serialize, Finalize).
- **Failure Isolation:** Corrupt files fail independently without interrupting or stopping the remaining batch jobs.
### 2.5 Groundbreaking GIS Engineering Capabilities
1. **Spatial Pre-Flight Doctor & Auto-Repair:**
   - Heuristic coordinate axis-inversion ($X \leftrightarrow Y$ / Lat vs. Lon) diagnosis with confidence score and 1-click swap repair.
   - CRS bounding box fingerprinting matching coordinate ranges against global/regional envelopes (e.g. Lambert-93, British National Grid, UTM zones).
   - 1-Click topology repair snapping unclosed rings, removing duplicate consecutive vertices, and cleaning NaNs.
2. **Interactive Map "Swipe Curtain" & Datum Shift Visualizer:**
   - Draggable vertical split-screen curtain comparing raw source features against reprojected target features.
   - Real-time geodetic vertex drift calculator verifying sub-millimeter survey tolerance.
3. **Multi-Layer GeoPackage Consolidator & QGIS Handoff Generator:**
   - Consolidates an entire batch of disparate files into a single unified OGC GeoPackage container (`.gpkg`).
   - Automatically generates an accompanying styled QGIS 3.x project file (`.qgs`) with symbology and layer grouping.
4. **Certified Geospatial QA/QC Audit Certificate:**
   - Cryptographically sealed with SHA-256 checksums of input and output files.
   - Full PROJ geodetic transformation pipeline disclosure, geometry validation metrics, and exportable/printable HTML report.
5. **Visual Batch Schema Harmonizer:**
   - Interactive matrix table mapping disparate column names from multiple contractors into a standardized schema with type coercion and casing rules.

---

## 3. Windows Desktop App (Electron)

The desktop app loads the built workbench directly inside an Electron window. It does
not require opening a browser or connecting to a local web server.

### 3.1 Build and run the desktop app
\`\`\`powershell
npm install
npm run desktop:dev
\`\`\`

### 3.2 Create the Windows installer

Create a distributable Windows x64 setup installer:

\`\`\`powershell
npm run desktop:dist
\`\`\`

The installer is written to \`release/OmniGeo-Setup-1.0.0-x64.exe\`.

---

## 4. Running the Web GIS Workbench

The application runs directly in modern desktop browsers via Vite and TypeScript:

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

The EPSG catalogue is generated from [epsg-index](https://www.npmjs.com/package/epsg-index) and its ISC license is included in the app at `licenses/epsg-index.txt`.
