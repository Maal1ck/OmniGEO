from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path

class SupportedFormat(str, Enum):
    GEOJSON = "geojson"
    SHAPEFILE = "shapefile"
    GEOPACKAGE = "geopackage"
    KML = "kml"
    CSV = "csv"
    FLATGEOBUF = "flatgeobuf"

class GeometryType(str, Enum):
    POINT = "Point"
    LINESTRING = "LineString"
    POLYGON = "Polygon"
    MULTIPOINT = "MultiPoint"
    MULTILINESTRING = "MultiLineString"
    MULTIPOLYGON = "MultiPolygon"
    GEOMETRYCOLLECTION = "GeometryCollection"
    UNKNOWN = "Unknown"

class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    COMPLETED_WARNS = "completed_warnings"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class CRSInfo:
    code: str  # e.g. "EPSG:4326"
    name: str
    area: str
    proj4: str
    wkt: Optional[str] = None
    is_geographic: bool = True
    unit: str = "degrees"

@dataclass
class SidecarFile:
    name: str
    extension: str
    size: int
    present: bool
    required: bool

@dataclass
class SpatialDataset:
    id: str
    path: Path
    name: str
    format: SupportedFormat
    size_bytes: int
    feature_count: int
    geometry_type: GeometryType
    detected_crs: Optional[CRSInfo]
    bounds: Tuple[float, float, float, float]
    sidecars: List[SidecarFile] = field(default_factory=list)
    is_valid: bool = True
    validation_issues: List[str] = field(default_factory=list)

@dataclass
class ConversionJob:
    id: str
    dataset: SpatialDataset
    target_format: SupportedFormat
    target_crs: str
    crs_mode: str  # "reproject" | "assign"
    output_path: Path
    layer_name: str
    status: JobStatus = JobStatus.QUEUED
    progress_pct: int = 0
    stage: str = "Queued"
    error: Optional[str] = None
    duration_ms: Optional[int] = None
