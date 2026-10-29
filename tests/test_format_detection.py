from src.geoflow.core.models import SupportedFormat, GeometryType, CRSInfo

def test_models_initialization():
    crs = CRSInfo(
        code="EPSG:4326",
        name="WGS 84",
        area="World",
        proj4="+proj=longlat +datum=WGS84",
        is_geographic=True,
        unit="degrees"
    )
    assert crs.code == "EPSG:4326"
    assert crs.is_geographic is True

def test_supported_formats():
    assert SupportedFormat.GEOPACKAGE.value == "geopackage"
    assert SupportedFormat.SHAPEFILE.value == "shapefile"
    assert SupportedFormat.GEOJSON.value == "geojson"
    assert SupportedFormat.KML.value == "kml"
    assert SupportedFormat.CSV.value == "csv"

def test_geometry_types():
    assert GeometryType.POLYGON.value == "Polygon"
    assert GeometryType.POINT.value == "Point"
    assert GeometryType.LINESTRING.value == "LineString"
