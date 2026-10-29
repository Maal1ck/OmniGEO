"""
OmniGeo by Maodo — Windows-First Geospatial Processing Workbench
Main native Qt Application Entrypoint.
"""
import sys
import os
from PySide6.QtWidgets import QApplication, QMainWindow, QLabel, QVBoxLayout, QWidget
from PySide6.QtCore import Qt

def main():
    app = QApplication(sys.argv)
    app.setApplicationName("OmniGeo by Maodo")
    app.setOrganizationName("OmniGeo")
    
    # Configure high-DPI scaling for modern 4K displays
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )

    window = QMainWindow()
    window.setWindowTitle("OmniGeo by Maodo — Geospatial Batch Processing Workbench")
    window.resize(1280, 800)
    
    central_widget = QWidget()
    layout = QVBoxLayout(central_widget)
    label = QLabel("OmniGeo by Maodo Initialized. Ready for Batch Processing.")
    label.setAlignment(Qt.AlignCenter)
    layout.addWidget(label)
    
    window.setCentralWidget(central_widget)
    window.show()
    
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
