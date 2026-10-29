import unittest
from src.geoflow.core.models import SupportedFormat, GeometryType, CRSInfo

class TestGeoFlowCore(unittest.TestCase):
    def test_crs_info_structure(self):
        crs = CRSInfo(
            code="EPSG:4326",
            name="WGS 84 (Geographic 2D)",
            area="World",
            proj4="+proj=longlat +datum=WGS84 +no_defs",
            is_geographic=True,
            unit="degrees"
        )
        self.assertEqual(crs.code, "EPSG:4326")
        self.assertTrue(crs.is_geographic)
        self.assertEqual(crs.unit, "degrees")

    def test_format_enumeration(self):
        self.assertIn("geopackage", [f.value for f in SupportedFormat])
        self.assertIn("shapefile", [f.value for f in SupportedFormat])
        self.assertIn("geojson", [f.value for f in SupportedFormat])
        self.assertIn("kml", [f.value for f in SupportedFormat])
        self.assertIn("csv", [f.value for f in SupportedFormat])

    def test_geometry_types(self):
        self.assertEqual(GeometryType.POLYGON.value, "Polygon")
        self.assertEqual(GeometryType.POINT.value, "Point")
        self.assertEqual(GeometryType.LINESTRING.value, "LineString")

if __name__ == '__main__':
    unittest.main()
