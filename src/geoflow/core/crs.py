from typing import Optional
import pyproj
from .models import CRSInfo

def get_crs_info(crs_identifier: str) -> Optional[CRSInfo]:
    """Inspects and normalizes a CRS identifier using pyproj."""
    try:
        crs = pyproj.CRS.from_user_input(crs_identifier)
        code = f"EPSG:{crs.to_epsg()}" if crs.to_epsg() else crs_identifier
        return CRSInfo(
            code=code,
            name=crs.name or "Unknown CRS",
            area=crs.area_of_use.name if crs.area_of_use else "Global",
            proj4=crs.to_proj4(),
            wkt=crs.to_wkt(),
            is_geographic=crs.is_geographic,
            unit=crs.axis_info[0].unit_name if crs.axis_info else "meters"
        )
    except Exception:
        return None

def create_transformer(source_crs: str, target_crs: str) -> pyproj.Transformer:
    """Builds a high-accuracy PROJ transformation pipeline with always_xy=True."""
    return pyproj.Transformer.from_crs(source_crs, target_crs, always_xy=True)
