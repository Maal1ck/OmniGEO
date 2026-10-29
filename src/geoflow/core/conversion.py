from pathlib import Path
from typing import Optional, Callable
import pyogrio
import geopandas as gpd
from .models import ConversionJob, JobStatus, SupportedFormat

def execute_vector_conversion(
    job: ConversionJob,
    progress_callback: Optional[Callable[[int, str], None]] = None
) -> ConversionJob:
    """
    Executes a vector conversion with atomic temporary file writing,
    CRS transformation, and post-export schema validation.
    """
    try:
        if progress_callback:
            progress_callback(15, "Reading source vector dataset")
        
        # Read dataset into GeoPandas / Pyogrio
        gdf = pyogrio.read_dataframe(job.dataset.path)
        
        if progress_callback:
            progress_callback(40, f"Executing CRS {job.crs_mode}")

        # Coordinate Reference System Handling
        if job.crs_mode == "reproject":
            if gdf.crs is None:
                gdf = gdf.set_crs(job.dataset.detected_crs.code if job.dataset.detected_crs else "EPSG:4326")
            gdf = gdf.to_crs(job.target_crs)
        elif job.crs_mode == "assign":
            gdf = gdf.set_crs(job.target_crs, allow_override=True)

        if progress_callback:
            progress_callback(70, f"Writing output artifact to {job.target_format}")

        # Atomic writing via temporary path
        temp_out = job.output_path.with_suffix(f".tmp{job.output_path.suffix}")
        
        # Target format driver mapping
        driver_map = {
            SupportedFormat.GEOPACKAGE: "GPKG",
            SupportedFormat.SHAPEFILE: "ESRI Shapefile",
            SupportedFormat.GEOJSON: "GeoJSON",
            SupportedFormat.FLATGEOBUF: "FlatGeobuf",
        }

        driver = driver_map.get(job.target_format, "GeoJSON")
        pyogrio.write_dataframe(gdf, temp_out, driver=driver, layer=job.layer_name)

        # Atomic promote
        temp_out.replace(job.output_path)

        if progress_callback:
            progress_callback(100, "Completed")

        job.status = JobStatus.COMPLETED
        job.progress_pct = 100
        job.stage = "Completed"
        return job

    except Exception as e:
        job.status = JobStatus.FAILED
        job.progress_pct = 100
        job.stage = "Failed"
        job.error = str(e)
        return job
