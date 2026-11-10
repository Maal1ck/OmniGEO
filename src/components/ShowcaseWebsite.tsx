/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  Globe, 
  Layers, 
  Stethoscope, 
  Calculator, 
  TableProperties, 
  Terminal, 
  Cpu, 
  FileBox, 
  Check, 
  Copy, 
  ChevronRight, 
  CheckCircle2, 
  ArrowRight,
  Monitor,
  Flame,
  FileCheck,
  Maximize2,
  HardDrive,
  Database,
  Search,
  BookOpen,
  FolderArchive,
  Workflow,
  HelpCircle,
  Lightbulb,
  Compass,
  FileSpreadsheet,
  Download,
  ExternalLink,
  Github,
  GitMerge
} from 'lucide-react';
import { Logo } from './Logo';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';
import { NavTab } from './Header';

interface ShowcaseWebsiteProps {
  onLaunchWorkbench: (tab?: NavTab) => void;
  onOpenConcatenation?: () => void;
  onOpenPostgis?: () => void;
  onOpenDoctor?: () => void;
  onOpenCRSModal?: () => void;
  onOpenJoin?: () => void;
}

export const ShowcaseWebsite: React.FC<ShowcaseWebsiteProps> = ({ 
  onLaunchWorkbench,
  onOpenConcatenation,
  onOpenPostgis,
  onOpenDoctor,
  onOpenCRSModal,
  onOpenJoin,
}) => {
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [activeToolId, setActiveToolId] = useState<string>('ingestion');

  const githubRepoUrl = 'https://github.com/Maal1ck/OmniGEO';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2200);
  };

  const walkthroughTools = [
    {
      id: 'ingestion',
      name: lang === 'fr' ? '1. Ingestion Multi-Formats & Excel' : '1. Multi-Format & Excel Ingestion',
      subtitle: lang === 'fr' ? 'DWG, Shapefile, GeoJSON, KML, CSV & Tableurs Excel' : 'DWG, Shapefiles, GeoJSON, KML, CSV & Excel Spreadsheets',
      icon: FileBox,
      tag: 'Input Engine',
      summary: lang === 'fr'
        ? 'Glissez-déposez n\'importe quel jeu de données spatiales (.shp complet, .dwg, .kml, .geojson) ou tableur Excel avec détection automatique de plus de 20 variantes de colonnes Latitude/Longitude.'
        : 'Drag & drop any spatial dataset (.shp bundles, .dwg CAD, .kml, .geojson) or Excel files with auto-detection of 20+ Lat/Lon column naming patterns.',
      features: [
        lang === 'fr' ? 'Support natif des fichiers DAO / CAD .dwg et DXF sans conversion préalable' : 'Native CAD .dwg & DXF support without pre-conversion',
        lang === 'fr' ? 'Configuration et importation simultanée de toutes les feuilles Excel : configurez X/Y, CRS et nom pour chaque onglet et importez tout en un clic !' : 'Configure and import all Excel sheets simultaneously: set Lon/Lat, CRS, and layer names per sheet and import in one click!',
        lang === 'fr' ? 'Isolation sélective des feuilles Excel ou couches GeoPackage (.gpkg) avec filtres visuels' : 'Selective Excel sheet or GeoPackage (.gpkg) vector layer isolation with visual checklists',
        lang === 'fr' ? 'Détection intelligente des colonnes X/Y/Lat/Lon dans Excel avec 6 942 CRS au choix' : 'Smart Lat/Lon/X/Y detection across Excel sheets with full 6,942 EPSG projection selector',
        lang === 'fr' ? 'Interrupteur d\'exploration récursive des sous-dossiers (Include / Exclude subfolders)' : 'Recursive subfolder traversal toggle for deep folder archives'
      ],
      stepByStep: [
        lang === 'fr' ? 'Rendez-vous dans l\'onglet "Atelier" ou "Espace de travail".' : 'Go to the "Craft" or "Workspace" tab.',
        lang === 'fr' ? 'Déposez votre classeur Excel (.xlsx/.xls) ou GeoPackage (.gpkg).' : 'Drop your Excel workbook (.xlsx/.xls) or GeoPackage (.gpkg).',
        lang === 'fr' ? 'Dans le dialogue, configurez chaque feuille (colonnes X/Y, CRS, nom) en cliquant dessus, ou appliquez les paramètres à toutes les feuilles.' : 'In the dialog, click each sheet to configure coordinates and CRS, or use the batch apply helper buttons.',
        lang === 'fr' ? 'Cliquez sur "Importer toutes les feuilles cochées" pour charger simultanément toutes vos couches en session !' : 'Click "Import All Checked Sheets" to load all your configured layers in one step!'
      ],
      proTip: lang === 'fr'
        ? 'Vous pouvez configurer 5 feuilles Excel différentes (ex: Bâtiments, Réseaux, Bornes) avec leurs propres colonnes de coordonnées et les importer simultanément en couches spatiales distinctes en un clic !'
        : 'You can configure 5 distinct Excel worksheets (e.g. Buildings, Parcels, Points) with their own coordinate columns and import them simultaneously as distinct spatial layers in one go!',
      actionTab: 'craft' as NavTab,
      actionLabel: lang === 'fr' ? 'Ouvrir l\'Atelier d\'Ingestion' : 'Open Craft Ingestion Studio',
    },
    {
      id: 'geodesy',
      name: lang === 'fr' ? '2. Moteur Géodésique & CRS EPSG' : '2. Geodetic CRS Engine (6,942 EPSG)',
      subtitle: lang === 'fr' ? 'Détection ultra-précise de Merchich, Sud_Maroc, UTM, Lambert & WGS 84' : 'Precise detection for Merchich Sud_Maroc, UTM, Lambert & WGS 84',
      icon: Globe,
      tag: 'Projection Core',
      summary: lang === 'fr'
        ? 'Notre registre géodésique interne embarque 6 942 définitions EPSG officielles. L\'algorithme analyse les descripteurs WKT/PRJ, les étendues de coordonnées et les métadonnées pour éliminer toute confusion de projection.'
        : 'Our built-in geodetic catalog embeds 6,942 official EPSG systems. Advanced heuristics inspect WKT/PRJ definitions, coordinate bounding boxes, and units to eliminate misidentification.',
      features: [
        lang === 'fr' ? 'Résolution exacte de Sud_Maroc Degrés (EPSG:4261) vs Sud_Maroc Métrique (EPSG:26192)' : 'Accurate discrimination between Merchich / Sud_Maroc degree (EPSG:4261) and metric grid (EPSG:26192)',
        lang === 'fr' ? 'Recherche instantanée dans le catalogue complet des 6 942 systèmes' : 'Instant search across the complete 6,942 EPSG registry by code, name, or area',
        lang === 'fr' ? 'Reprojection à la volée haute fidélité vers WGS 84 (EPSG:4326) ou Web Mercator (EPSG:3857)' : 'High-precision on-the-fly reprojection with mathematical datum shifts',
        lang === 'fr' ? 'Bouton d\'override manuel pour corriger le CRS de n\'importe quelle couche en un clic' : 'Manual CRS override badge on every layer to change or inspect geodetic parameters'
      ],
      stepByStep: [
        lang === 'fr' ? 'Cliquez sur le badge CRS d\'une couche dans la liste des fichiers.' : 'Click the CRS badge next to any layer in the dataset list.',
        lang === 'fr' ? 'Tapez votre code (ex: "4261", "26192", "2154", "32628") ou le nom de la zone.' : 'Type your EPSG code (e.g. "4261", "26192", "2154") or region name.',
        lang === 'fr' ? 'Sélectionnez le système de coordonnées correspondant et confirmez.' : 'Select the target coordinate reference system and confirm.',
        lang === 'fr' ? 'La couche est immédiatement re-projetée et synchronisée avec la carte Leaflet.' : 'The dataset is reprojected and immediately aligned on the Leaflet canvas.'
      ],
      proTip: lang === 'fr'
        ? 'Si votre fichier a des coordonnées entre -18° et +18° de latitude/longitude avec la mention Sud_Maroc, le moteur applique automatiquement le CRS géographique EPSG:4261 plutôt que la grille métrique 26192.'
        : 'If coordinates are degree-based (e.g., -13° to -5° Lon, 21° to 28° Lat) with Sud_Maroc naming, OmniGeo selects EPSG:4261 (geographic 2D) rather than projected metric 26192.',
      actionTab: 'workspace' as NavTab,
      actionAction: onOpenCRSModal,
      actionLabel: lang === 'fr' ? 'Rechercher un CRS dans le catalogue' : 'Browse 6,942 EPSG Catalog',
    },
    {
      id: 'concatenation',
      name: lang === 'fr' ? '3. Concaténation & Mappage de Colonnes' : '3. Layer Concatenation & Schema Mapping',
      subtitle: lang === 'fr' ? 'Fusionnez plusieurs fichiers et unifiez leurs attributs' : 'Merge multiple vector layers and harmonize attribute columns',
      icon: Workflow,
      tag: 'Data Harmonizer',
      summary: lang === 'fr'
        ? 'Combinez 2 ou plusieurs couches vectorielles (même de formats différents) en un fichier consolidé unique avec un mappage intelligent des attributs.'
        : 'Combine 2 or more spatial layers into a single consolidated dataset with interactive column mapping, schema harmonization, and output preview.',
      features: [
        lang === 'fr' ? 'Fusion multi-sources (mélangez Shapefile + GeoJSON + Excel géolocalisé)' : 'Multi-source union (mix Shapefile + GeoJSON + geolocated Excel)',
        lang === 'fr' ? 'Mappage visuel des colonnes avec suggestions intelligentes par similarité de nom' : 'Visual column mapping with automatic fuzzy attribute matching',
        lang === 'fr' ? 'Aperçu en temps réel des enregistrements fusionnés et compteurs d\'attributs' : 'Live preview table of combined records with null value fallback handling',
        lang === 'fr' ? 'Export direct vers GeoJSON, Shapefile ou intégration PostGIS immédiate' : 'Direct export to new GeoJSON/Shapefile or push straight to PostGIS'
      ],
      stepByStep: [
        lang === 'fr' ? 'Dans l\'Espace de travail ou la barre d\'outils, cliquez sur "Concaténer les couches".' : 'Click "Concatenate Layers" in the top bar or workspace actions.',
        lang === 'fr' ? 'Cochez les couches que vous souhaitez combiner.' : 'Select the datasets you wish to merge together.',
        lang === 'fr' ? 'Définissez le nom de la nouvelle couche et configurez la correspondance des colonnes.' : 'Set output table name and review or adjust column mappings.',
        lang === 'fr' ? 'Cliquez sur "Générer la couche fusionnée" pour l\'ajouter instantanément à votre session.' : 'Click "Generate Merged Layer" to produce the combined dataset.'
      ],
      proTip: lang === 'fr'
        ? 'Si vos fichiers utilisent des appellations différentes (ex: "id_parcelle" et "PARCEL_ID"), le système les aligne dans une même colonne propre sans perte de données !'
        : 'If datasets use different field names (e.g. "parc_id" vs "PARCEL_ID"), use column mapping to combine them into one consistent attribute column.',
      actionTab: 'workspace' as NavTab,
      actionAction: onOpenConcatenation,
      actionLabel: lang === 'fr' ? 'Lancer l\'Outil de Concaténation' : 'Open Concatenation Tool',
    },
    {
      id: 'joins',
      name: lang === 'fr' ? '4. Jointures Spatiales & Attributaires' : '4. Spatial & Attribute Joins (Table & Spatial)',
      subtitle: lang === 'fr' ? 'Jointure par clé (ex: parcelles & propriétaires) ou par intersection géographique' : 'Join by common key field or geometric overlay (intersects, within, contains)',
      icon: GitMerge,
      tag: 'Relational & Spatial Core',
      summary: lang === 'fr'
        ? 'Associez des données tabulaires (ex: table Excel de propriétaires, loyers, cadastre) à vos couches spatiales par identifiant commun, ou réalisez des jointures spatiales pour transférer automatiquement les attributs d\'un polygone aux points qu\'il contient.'
        : 'Join non-spatial tabular data (Excel sheets, census data) to vector geometries using common key IDs, or perform spatial joins to transfer attributes between layers based on geometric containment or intersection.',
      features: [
        lang === 'fr' ? 'Jointure attributaire (Left Outer ou Inner) avec normalisation intelligente des types (texte/numérique)' : 'Attribute join (Left Outer or Inner) with flexible type matching (text vs numbers)',
        lang === 'fr' ? 'Jointure spatiale par algorithme Ray-Casting & bounding-box (Intersects, Within, Contains)' : 'Spatial join using robust ray-casting polygon topology (Intersects, Within, Contains)',
        lang === 'fr' ? 'Reprojection géodésique automatique entre couches ayant des CRS différents' : 'Automatic geodetic reprojection between layers with different coordinate systems',
        lang === 'fr' ? 'Sélection sélective des attributs à importer et préfixage personnalisable (ex: join_)' : 'Selective attribute column checklist with custom prefixing to avoid collisions',
        lang === 'fr' ? 'Aperçu en direct du taux de correspondance (%) et tableau d\'échantillon avant création' : 'Live match rate statistics (%) and sample preview table before finalizing'
      ],
      stepByStep: [
        lang === 'fr' ? 'Ouvrez le dialogue de Jointure via la barre d\'outils, l\'Atelier, ou le raccourci Ctrl+K.' : 'Open the Join dialog from the top toolbar, Craft Studio, or Ctrl+K shortcut.',
        lang === 'fr' ? 'Choisissez le mode : "Jointure Attributaire" (clé commune) ou "Jointure Spatiale" (position géo).' : 'Select the mode: "Attribute Join" (common key ID) or "Spatial Join" (spatial location).',
        lang === 'fr' ? 'Sélectionnez la couche cible et la couche jointe, puis choisissez les champs clés ou le prédicat.' : 'Select target and join layers, pick key fields or spatial predicate (e.g. Intersects).',
        lang === 'fr' ? 'Vérifiez le taux de correspondance dans l\'aperçu et cliquez sur "Exécuter et Créer la Couche".' : 'Review the match rate percentage in the preview table and click "Execute & Create Layer".'
      ],
      proTip: lang === 'fr'
        ? 'Parfait pour le cadastre : importez vos parcelles (Shapefile) et un fichier Excel de propriétaires fonciers. La jointure attributaire sur le numéro de parcelle fusionne toutes les infos d\'un seul coup !'
        : 'Ideal for cadastre & municipal workflows: import parcel polygons and an Excel file of landowner records. The attribute join on parcel ID attaches all owner data in one click!',
      actionTab: 'workspace' as NavTab,
      actionAction: onOpenJoin,
      actionLabel: lang === 'fr' ? 'Ouvrir le Studio de Jointures' : 'Launch Join Studio',
    },
    {
      id: 'postgis',
      name: lang === 'fr' ? '5. Intégration PostgreSQL & PostGIS' : '5. PostgreSQL & PostGIS Integration',
      subtitle: lang === 'fr' ? 'Export 3 clics vers pgAdmin 4, psql CLI & scripts Python' : '3-click import into pgAdmin 4, psql CLI & Python GeoPandas',
      icon: Database,
      tag: 'Enterprise DB',
      summary: lang === 'fr'
        ? 'Exportez n\'importe quel jeu de données spatiales vers PostgreSQL/PostGIS sans installer d\'outils tiers complexes. Obtenez des scripts SQL optimisés avec index spatial GiST et support pgAdmin 4.'
        : 'Streamline loading geospatial data into PostgreSQL/PostGIS. Generates production-ready DDL/DML SQL scripts with GiST spatial indexes, pgAdmin 4 query workflows, and Python scripts.',
      features: [
        lang === 'fr' ? 'Workflow pgAdmin 4 interactif avec explications détaillées des identifiants' : 'Interactive pgAdmin 4 guide clarifying database connection credentials',
        lang === 'fr' ? 'Recherche parmi l\'ensemble des 6 942 SRID/EPSG pour la colonne géométrique' : 'Full 6,942 EPSG/SRID selector for target geometry column',
        lang === 'fr' ? 'Script SQL complet avec DROP TABLE IF EXISTS et index spatial USING GIST(geom)' : 'Complete PostGIS SQL script with transaction safety and spatial indexing',
        lang === 'fr' ? 'Générateur de commandes terminal psql, ogr2ogr et script Python GeoPandas' : 'Ready-to-run psql CLI, ogr2ogr batch commands, and Python automation code'
      ],
      stepByStep: [
        lang === 'fr' ? 'Cliquez sur le bouton "PostGIS" dans la barre d\'outils ou dans l\'Espace de travail.' : 'Click the "PostGIS" button in the top navigation or workspace.',
        lang === 'fr' ? 'Choisissez la couche source et le SRID cible (ex: 4261 ou 4326).' : 'Select the source layer and set your target SRID (e.g., 4261 or 4326).',
        lang === 'fr' ? 'Téléchargez le fichier .sql ou copiez le code SQL d\'un clic.' : 'Download the generated .sql file or copy the SQL code.',
        lang === 'fr' ? 'Ouvrez pgAdmin 4, connectez-vous avec votre mot de passe PostgreSQL, ouvrez le Query Tool et exécutez !' : 'Open pgAdmin 4, open Query Tool on your database, paste and run (F5)!'
      ],
      proTip: lang === 'fr'
        ? 'Pourquoi OmniGeo ne demande pas de mot de passe ? Parce que l\'application s\'exécute 100% dans votre navigateur sans serveur backend. Vous saisissez votre mot de passe en toute sécurité directement dans pgAdmin 4.'
        : 'Why does OmniGeo not prompt for your database password? OmniGeo is 100% client-side privacy-first; you enter your credentials safely in pgAdmin 4 without sharing them.',
      actionTab: 'workspace' as NavTab,
      actionAction: onOpenPostgis,
      actionLabel: lang === 'fr' ? 'Ouvrir l\'Exporteur PostGIS' : 'Launch PostGIS Exporter',
    },
    {
      id: 'doctor',
      name: lang === 'fr' ? '6. Docteur Spatial & Calculs de Surfaces' : '6. Pre-Flight Spatial Doctor & Surfaces',
      subtitle: lang === 'fr' ? 'Réparation de géométries invalides & calcul précis en Hectares' : 'Repair invalid geometries & calculate geodesic surfaces in ha/m²',
      icon: Stethoscope,
      tag: 'QA / QC Repair',
      summary: lang === 'fr'
        ? 'Diagnostiquez les erreurs topologiques critiques : détection des inversions Lat/Lon, fermeture automatique des anneaux de polygones non scellés et calcul de superficie géodésique.'
        : 'Diagnose critical topology flaws: detect inverted Lat/Lon coordinates, close unclosed polygon rings, remove self-intersections, and calculate geodesic areas in Hectares.',
      features: [
        lang === 'fr' ? 'Détection automatique d\'inversion de coordonnées X/Y et remise en ordre' : 'Auto-detection of inverted latitude/longitude coordinates and instant flip',
        lang === 'fr' ? 'Fermeture automatique des polygones ouverts selon les standards OGC' : 'Auto-closure of unsealed polygon boundary rings per OGC standards',
        lang === 'fr' ? 'Calcul de surface en Hectares (ha), m² et km² avec ajout direct d\'une colonne d\'attribut' : 'Geodesic area calculations in Hectares, m², or km² injected as new attribute columns',
        lang === 'fr' ? 'Audit d\'intégrité mathématique sans altérer les attributs métiers existants' : 'Mathematical integrity audit without modifying business properties'
      ],
      stepByStep: [
        lang === 'fr' ? 'Cliquez sur "Docteur Spatial" dans le menu Outils ou dans la vue carte.' : 'Click "Pre-Flight Spatial Doctor" from the Tools dropdown or map quick actions.',
        lang === 'fr' ? 'Lancez le diagnostic sur une couche ou l\'ensemble de vos fichiers.' : 'Run diagnosis on a specific layer or all ingested files.',
        lang === 'fr' ? 'Visualisez les anomalies détectées et appliquez la réparation en un clic.' : 'Review flagged topology issues and click "Auto-Repair All".',
        lang === 'fr' ? 'Utilisez le bouton "Calculer les surfaces (ha)" pour enrichir vos polygones.' : 'Use "Calculate Surfaces (ha)" to compute exact polygon areas.'
      ],
      proTip: lang === 'fr'
        ? 'Si vos polygones apparaissent étirés ou au mauvais endroit sur la carte du monde, le Docteur Spatial détecte si les coordonnées étaient inversées (Y, X au lieu de X, Y).'
        : 'If your polygons appear outside their expected region, the Spatial Doctor detects coordinate axis inversion (Y, X vs X, Y) and corrects them instantly.',
      actionTab: 'workspace' as NavTab,
      actionAction: onOpenDoctor,
      actionLabel: lang === 'fr' ? 'Ouvrir le Docteur Spatial' : 'Open Spatial Doctor',
    },
    {
      id: 'map',
      name: lang === 'fr' ? '7. Studio Cartographique Multi-Couches' : '7. Multi-Layer Map Studio',
      subtitle: lang === 'fr' ? 'Cadrage Afrique par défaut, zoom au clic sur ligne & symbologie' : 'Africa-first framing, click-row-to-zoom & 18-color palette',
      icon: Layers,
      tag: 'Interactive Carto',
      summary: lang === 'fr'
        ? 'Visualisez simultanément plusieurs couches vectorielles sur un canevas Leaflet performant. La carte s\'initialise centrée sur l\'Afrique puis s\'ajuste automatiquement dès l\'ajout de données.'
        : 'Visualize multiple vector layers simultaneously on a smooth Leaflet canvas. Always centers on Africa on initial load, auto-fits to ingested data, and lets you zoom to any feature by clicking its attribute row.',
      features: [
        lang === 'fr' ? 'Cadrage Afrique par défaut avec bouton dédié "Afrique" dans la barre supérieure' : 'Africa-first default framing with dedicated "Africa" button in top toolbar',
        lang === 'fr' ? 'Zoom automatique fluide sur l\'étendue des données dès qu\'un fichier est chargé' : 'Automatic smooth fit to data extent as soon as datasets are loaded',
        lang === 'fr' ? 'Clic sur une ligne du tableau attributaire pour zoomer directement sur l\'entité' : 'Click any row in the attribute drawer to zoom and highlight that specific feature',
        lang === 'fr' ? 'Palette de 18 couleurs cartographiques et curseurs d\'opacité entièrement thématisés' : '18-color symbology palette and per-layer opacity sliders with light theme'
      ],
      stepByStep: [
        lang === 'fr' ? 'Basculez sur l\'onglet "Studio carto".' : 'Switch to the "Map Studio" tab.',
        lang === 'fr' ? 'Ouvrez le panneau latéral "Légende / Couches" pour activer ou masquer vos couches.' : 'Open the "Legend / Layers" sidebar to toggle multiple layer visibility.',
        lang === 'fr' ? 'Ajustez les couleurs et l\'opacité (10% à 100%) selon vos besoins cartographiques.' : 'Customize layer stroke/fill colors and opacity sliders.',
        lang === 'fr' ? 'Déployez la table attributaire en bas, puis cliquez sur n\'importe quelle entité pour zoomer dessus.' : 'Expand the attribute drawer at the bottom and click any row to fly to it.'
      ],
      proTip: lang === 'fr'
        ? 'Le mode glissière "Swipe Comparison" vous permet de comparer visuellement la couche originale et sa version re-projetée pour vérifier l\'absence de déformation !'
        : 'Use the "Swipe Comparison" mode to visually inspect the source dataset side-by-side with its reprojected output layer to verify alignment.',
      actionTab: 'map' as NavTab,
      actionLabel: lang === 'fr' ? 'Explorer la Carte Interactive' : 'Open Map Studio',
    },
    {
      id: 'batch',
      name: lang === 'fr' ? '8. Labo de Conversion & Audit QA/QC' : '8. Batch Conversion & Audit QA/QC',
      subtitle: lang === 'fr' ? 'Transformation en masse & certificats d\'audit cryptographiques' : 'Bulk format transformation & SHA-256 integrity certificates',
      icon: FileCheck,
      tag: 'Audit Provenance',
      summary: lang === 'fr'
        ? 'Convertissez simultanément des dizaines de fichiers vers GeoPackage OGC, Shapefile, GeoJSON ou KML, tout en générant un certificat d\'audit QA/QC avec empreinte SHA-256 certifiée.'
        : 'Convert dozens of spatial files in batch to OGC GeoPackage, ESRI Shapefile, GeoJSON, or KML, with cryptographically verifiable SHA-256 provenance reports.',
      features: [
        lang === 'fr' ? 'Moteur de conversion parallèle haute vitesse exécuté dans le navigateur' : 'High-speed parallel client-side conversion engine',
        lang === 'fr' ? 'Génération d\'empreintes SHA-256 pour chaque fichier entrant et sortant' : 'Cryptographic SHA-256 hashing for input and output provenance',
        lang === 'fr' ? 'Export d\'un certificat d\'audit téléchargeable pour les livrables clients OGC' : 'Downloadable ISO/OGC QA/QC Audit Certificate for engineering deliverables',
        lang === 'fr' ? 'Téléchargement groupé au format ZIP ou handoff consolidé' : 'One-click consolidated ZIP download with manifest metadata'
      ],
      stepByStep: [
        lang === 'fr' ? 'Accédez au "Labo de conversion" ou lancez le traitement par lots.' : 'Go to "Conversion Lab" or trigger batch processing.',
        lang === 'fr' ? 'Sélectionnez le format de destination souhaité (Shapefile, GeoPackage, GeoJSON, KML).' : 'Choose your target format (Shapefile, GeoPackage, GeoJSON, KML).',
        lang === 'fr' ? 'Lancez la conversion et suivez la barre de progression en temps réel.' : 'Click "Start Batch" and monitor real-time progress indicators.',
        lang === 'fr' ? 'Téléchargez le pack d\'artefacts ou consultez le certificat de validation.' : 'Download output artifacts and inspect the certified QA/QC report.'
      ],
      proTip: lang === 'fr'
        ? 'OmniGeo préserve 100% de la confidentialité de vos données géospatiales : aucun octet ne transite sur un serveur distant.'
        : 'OmniGeo operates 100% client-side via WebAssembly: zero telemetry, zero data exfiltration, air-gapped security.',
      actionTab: 'lab' as NavTab,
      actionLabel: lang === 'fr' ? 'Accéder au Labo de Conversion' : 'Open Conversion Lab',
    }
  ];

  const activeTool = walkthroughTools.find(t => t.id === activeToolId) || walkthroughTools[0];

  return (
    <div className={`flex-1 flex flex-col h-[calc(100vh-3.75rem)] overflow-y-auto transition-colors font-sans selection:bg-amber-500/20 selection:text-amber-900 ${
      theme === 'light' 
        ? 'bg-[#FAF8F5] text-stone-900' 
        : 'bg-[#13110E] text-[#F5EBE1]'
    }`}>
      
      {/* 1. TOP ANNOUNCEMENT / CONTEXT BANNER */}
      <aside 
        aria-label="Walkthrough tutorial banner" 
        className={`border-b px-4 py-2.5 text-xs flex items-center justify-between transition-colors ${
          theme === 'light' 
            ? 'bg-[#F2ECE3] border-[#E2DBD0] text-stone-700' 
            : 'bg-gradient-to-r from-amber-950/80 via-stone-900 to-amber-950/80 border-amber-600/30 text-stone-300'
        }`}
      >
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-amber-700 dark:text-amber-300">
              {lang === 'fr' ? 'OmniGeo par Maodo · Guide & Tutoriel :' : 'OmniGeo by Maodo · Tutorial & Guide :'}
            </span>
            <span className="hidden sm:inline">
              {lang === 'fr' ? 'Maîtrisez les 7 outils géospatiaux clés' : 'Master all 7 core geospatial workbench tools'}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => onLaunchWorkbench('craft')}
              className="text-amber-700 dark:text-amber-300 hover:underline font-bold flex items-center space-x-1"
            >
              <span>{lang === 'fr' ? 'Lancer l\'application' : 'Launch App'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <span className="text-stone-400">·</span>
            <a 
              href={githubRepoUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-amber-600 flex items-center space-x-1"
            >
              <Github className="w-3 h-3" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </aside>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 space-y-12">

        {/* 2. HEADER & INTRODUCTION */}
        <section className="text-center space-y-4 pt-2">
          <div className={`inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-medium border shadow-xs ${
            theme === 'light'
              ? 'bg-amber-100/80 border-amber-300 text-amber-900'
              : 'bg-amber-950/80 border-amber-600/40 text-amber-300'
          }`}>
            <BookOpen className="w-3.5 h-3.5 text-amber-500" />
            <span>{lang === 'fr' ? 'GUIDE D\'UTILISATION COMPLET & TUTORIEL' : 'COMPREHENSIVE TOOL WALKTHROUGH & TUTORIAL'}</span>
          </div>

          <div className="flex justify-center my-2">
            <div className="relative group cursor-pointer" onClick={() => onLaunchWorkbench('craft')}>
              <Logo size={72} className="group-hover:scale-105 transition-transform duration-300" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-4xl font-display font-extrabold tracking-tight">
            {lang === 'fr' ? (
              <>Maîtrisez <span className="text-amber-600 dark:text-amber-400">OmniGeo</span> pas à pas</>
            ) : (
              <>Master <span className="text-amber-600 dark:text-amber-400">OmniGeo</span> Step-by-Step</>
            )}
          </h1>

          <p className={`max-w-2xl mx-auto text-xs sm:text-sm leading-relaxed ${
            theme === 'light' ? 'text-stone-600' : 'text-stone-400'
          }`}>
            {lang === 'fr' 
              ? 'Découvrez en détail le fonctionnement des outils essentiels : ingestion de fichiers CAO/SIG/Excel, correction des projections CRS, concaténation avec mappage d\'attributs, export PostGIS et cartographie interactive.'
              : 'Detailed step-by-step documentation for all core features: multi-format CAD/GIS/Excel ingestion, geodetic CRS precision, schema concatenation, PostGIS export, and interactive multi-layer cartography.'}
          </p>
        </section>

        {/* 3. INTERACTIVE 7-TOOL SELECTOR TABS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-stone-500 font-bold flex items-center space-x-2">
              <Workflow className="w-4 h-4 text-amber-500" />
              <span>{lang === 'fr' ? 'Sélectionnez un outil à explorer :' : 'Select a tool to explore :'}</span>
            </h2>
            <span className="text-xs font-mono text-stone-400 hidden sm:inline">
              {walkthroughTools.length} {lang === 'fr' ? 'modules disponibles' : 'tools available'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {walkthroughTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = tool.id === activeToolId;

              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveToolId(tool.id)}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 group ${
                    isActive
                      ? (theme === 'light'
                          ? 'bg-amber-100/90 border-amber-500 shadow-sm ring-2 ring-amber-400/40 text-stone-950 font-bold'
                          : 'bg-amber-950/60 border-amber-500 shadow-md ring-2 ring-amber-500/40 text-white font-bold')
                      : (theme === 'light'
                          ? 'bg-white border-[#E2DBD0] hover:border-amber-400 hover:bg-stone-50 text-stone-700'
                          : 'bg-[#181411] border-stone-800 hover:border-stone-700 hover:bg-[#201A16] text-stone-300')
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                      isActive
                        ? 'bg-amber-500 text-stone-950'
                        : theme === 'light' ? 'bg-[#F2ECE3] text-stone-700' : 'bg-stone-800 text-stone-300'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    {isActive && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono block opacity-60">
                      {tool.tag}
                    </span>
                    <span className="text-xs font-display font-semibold line-clamp-1">
                      {tool.name.replace(/^\d+\.\s*/, '')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. ACTIVE TOOL DEEP-DIVE WALKTHROUGH CARD */}
        <section className={`rounded-3xl border p-6 sm:p-8 space-y-6 transition-all ${
          theme === 'light'
            ? 'bg-white border-[#E2DBD0] shadow-sm text-stone-900'
            : 'bg-[#181411] border-stone-800 shadow-xl text-[#FAF6F0]'
        }`}>
          {/* Card Title & Top Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-start space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <activeTool.icon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {activeTool.tag}
                  </span>
                  <span className="text-xs font-mono text-stone-400">
                    Module #{walkthroughTools.findIndex(t => t.id === activeTool.id) + 1} of 7
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-display font-bold mt-1">
                  {activeTool.name}
                </h3>
                <p className="text-xs sm:text-sm text-stone-500 font-mono">
                  {activeTool.subtitle}
                </p>
              </div>
            </div>

            {/* Launch / Try Button */}
            <div className="shrink-0 flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  if (activeTool.actionAction) {
                    activeTool.actionAction();
                  } else {
                    onLaunchWorkbench(activeTool.actionTab);
                  }
                }}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-display font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-950/20 transition-all transform active:scale-95"
              >
                <span>{activeTool.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Overview Paragraph */}
          <div className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed border ${
            theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0] text-stone-700' : 'bg-[#120F0D] border-stone-800 text-stone-300'
          }`}>
            <p>{activeTool.summary}</p>
          </div>

          {/* Grid: Key Features & Step-by-Step Instructions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column A: Key Features */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono uppercase font-bold text-amber-600 dark:text-amber-400 flex items-center space-x-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{lang === 'fr' ? 'Fonctionnalités & Spécifications :' : 'Key Features & Capabilities :'}</span>
              </h4>

              <div className="space-y-2">
                {activeTool.features.map((feat, i) => (
                  <div 
                    key={i} 
                    className={`p-3 rounded-xl border text-xs flex items-start space-x-2.5 ${
                      theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0] text-stone-800' : 'bg-[#15110E] border-stone-800 text-stone-300'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Column B: Step-by-Step How-To */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono uppercase font-bold text-amber-600 dark:text-amber-400 flex items-center space-x-2">
                <Compass className="w-3.5 h-3.5" />
                <span>{lang === 'fr' ? 'Guide d\'utilisation pas à pas :' : 'Step-by-Step Workflow :'}</span>
              </h4>

              <div className="space-y-2">
                {activeTool.stepByStep.map((step, i) => (
                  <div 
                    key={i} 
                    className={`p-3 rounded-xl border text-xs flex items-start space-x-3 ${
                      theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0] text-stone-800' : 'bg-[#15110E] border-stone-800 text-stone-300'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pro Tip Callout Box */}
          <div className={`p-4 rounded-2xl border flex items-start space-x-3 ${
            theme === 'light' 
              ? 'bg-amber-50/70 border-amber-300 text-stone-800' 
              : 'bg-amber-950/20 border-amber-600/30 text-amber-200'
          }`}>
            <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <span className="font-bold block uppercase font-mono text-[11px] text-amber-700 dark:text-amber-400">
                {lang === 'fr' ? 'Conseil d\'expert :' : 'Pro Tip & Best Practice :'}
              </span>
              <p className="leading-relaxed">{activeTool.proTip}</p>
            </div>
          </div>
        </section>

        {/* 5. WINDOWS DESKTOP RELEASE & OFFLINE WEB SECTION (100% THEMED FOR LIGHT & DARK) */}
        <section className={`rounded-3xl border p-6 sm:p-8 space-y-6 transition-colors ${
          theme === 'light'
            ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-sm'
            : 'bg-[#181411] border-stone-800 text-[#FAF6F0]'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
            <div>
              <div className="flex items-center space-x-2">
                <Monitor className="w-5 h-5 text-amber-500" />
                <h3 className="text-xl sm:text-2xl font-display font-bold">
                  {lang === 'fr' ? 'Distribution Windows (.exe) & Mode Web Déconnecté' : 'Windows Desktop Release (.exe) & Offline Web'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-stone-500 font-mono mt-1">
                {lang === 'fr' 
                  ? 'Exécution 100% autonome en local-first sans connexion internet requise' 
                  : '100% local-first air-gapped execution without external internet required'}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <a
                href={githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  theme === 'light'
                    ? 'bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-800'
                    : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
                }`}
              >
                <Github className="w-3.5 h-3.5" />
                <span>GitHub Releases</span>
              </a>
            </div>
          </div>

          {/* Specs comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className={`p-4 rounded-2xl border space-y-2 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#120F0D] border-stone-800'
            }`}>
              <div className="text-amber-600 dark:text-amber-400 font-bold flex items-center space-x-1.5">
                <HardDrive className="w-4 h-4" />
                <span>Zéro Dépendance</span>
              </div>
              <p className="text-stone-500 font-sans text-xs">
                {lang === 'fr' 
                  ? 'Pas besoin de Node.js, Python ou GDAL installés. Tout est embarqué en WebAssembly et binaire natif.'
                  : 'No Node.js, Python, or GDAL installation required. All dependencies run inside self-contained WASM.'}
              </p>
            </div>

            <div className={`p-4 rounded-2xl border space-y-2 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#120F0D] border-stone-800'
            }`}>
              <div className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Confidentialité Totale</span>
              </div>
              <p className="text-stone-500 font-sans text-xs">
                {lang === 'fr' 
                  ? 'Vos fichiers cadastraux et géométries sensibles restent confinés à votre ordinateur.'
                  : 'Your cadastral records, boundaries, and geometries remain 100% inside your local device.'}
              </p>
            </div>

            <div className={`p-4 rounded-2xl border space-y-2 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#120F0D] border-stone-800'
            }`}>
              <div className="text-amber-600 dark:text-amber-400 font-bold flex items-center space-x-1.5">
                <Cpu className="w-4 h-4" />
                <span>Multi-Plateforme</span>
              </div>
              <p className="text-stone-500 font-sans text-xs">
                {lang === 'fr' 
                  ? 'Compatible avec Windows 10/11 64-bit ainsi que tout navigateur moderne (Chrome, Edge, Firefox, Safari).'
                  : 'Runs on Windows 10/11 64-bit and modern browsers with WebAssembly and Web Worker support.'}
              </p>
            </div>
          </div>
        </section>

        {/* 6. FAQ & GEODETIC TROUBLESHOOTING */}
        <section className={`rounded-3xl border p-6 sm:p-8 space-y-5 transition-colors ${
          theme === 'light'
            ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-sm'
            : 'bg-[#181411] border-stone-800 text-[#FAF6F0]'
        }`}>
          <div className="flex items-center space-x-2">
            <HelpCircle className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg sm:text-xl font-display font-bold">
              {lang === 'fr' ? 'Foire Aux Questions & Résolution Géodésique' : 'FAQ & Geodetic Troubleshooting'}
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            {/* Q1: Sud_Maroc EPSG 4261 vs 26192 */}
            <details className={`p-3.5 rounded-xl border group transition-colors ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#14100D] border-stone-800'
            }`}>
              <summary className="font-bold cursor-pointer flex items-center justify-between text-stone-800 dark:text-stone-200">
                <span>{lang === 'fr' 
                  ? 'Pourquoi mon fichier marocain utilisait-il 26192 ou 27700 et comment OmniGeo garantit EPSG:4261 ?' 
                  : 'Why was my Moroccan file previously showing 26192 or 27700, and how does OmniGeo guarantee EPSG:4261?'}</span>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-amber-500 shrink-0" />
              </summary>
              <div className="mt-2.5 pt-2 border-t border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 space-y-1.5 leading-relaxed font-sans">
                <p>
                  {lang === 'fr'
                    ? 'Le datum Merchich au Maroc possède deux variantes courantes : une représentation géographique en degrés décimaux (Sud_Maroc_degree, EPSG:4261) et une grille cartographique projetée en mètres (Lambert Sud Maroc, EPSG:26192). Les bibliothèques génériques confondaient souvent le nom textuel ou le range de coordonnées.'
                    : 'The Merchich datum in Morocco has two primary representations: a geographic 2D coordinate system in degrees (Sud_Maroc_degree, EPSG:4261) and a projected metric grid (Lambert Sud Maroc, EPSG:26192). Generic libraries often mistakenly fallback to British or metric codes.'}
                </p>
                <p>
                  {lang === 'fr'
                    ? 'OmniGeo intègre une heuristique spécifique : si le descripteur mentionne "Sud_Maroc" ou "Merchich" et que les coordonnées sont de l\'ordre de -18° à +18° de latitude/longitude, il sélectionne avec 100% de certitude le CRS EPSG:4261.'
                    : 'OmniGeo applies targeted geodetic inspection: whenever descriptors match "Sud_Maroc" or "Merchich" and coordinates fall within regional degree bounds, it assigns EPSG:4261.'}
                </p>
              </div>
            </details>

            {/* Q2: Excel coordinate headers */}
            <details className={`p-3.5 rounded-xl border group transition-colors ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#14100D] border-stone-800'
            }`}>
              <summary className="font-bold cursor-pointer flex items-center justify-between text-stone-800 dark:text-stone-200">
                <span>{lang === 'fr' 
                  ? 'Comment importer des fichiers Excel contenant des noms de colonnes inhabituels ?' 
                  : 'How do I import Excel spreadsheets with unusual coordinate column names?'}</span>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-amber-500 shrink-0" />
              </summary>
              <div className="mt-2.5 pt-2 border-t border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 space-y-1.5 leading-relaxed font-sans">
                <p>
                  {lang === 'fr'
                    ? 'OmniGeo scanne automatiquement plus de 20 combinaisons d\'en-têtes (lat, latitude, lat_dd, X, Y, lon, long, longitude, coord_x, coord_y, etc.). Si vos colonnes portent un nom sur-mesure, une boîte de dialogue interactive vous permet de les sélectionner manuellement ainsi que de définir le CRS exact parmi les 6 942 disponibles.'
                    : 'OmniGeo automatically matches 20+ common column patterns (lat, latitude, lat_dd, X, Y, lon, long, longitude, coord_x, coord_y, etc.). If custom column names are used, an interactive modal appears allowing you to select longitude/latitude fields and assign any of the 6,942 EPSG projections.'}
                </p>
              </div>
            </details>

            {/* Q3: PostGIS credentials */}
            <details className={`p-3.5 rounded-xl border group transition-colors ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#14100D] border-stone-800'
            }`}>
              <summary className="font-bold cursor-pointer flex items-center justify-between text-stone-800 dark:text-stone-200">
                <span>{lang === 'fr' 
                  ? 'Pourquoi l\'outil PostGIS ne demande-t-il pas de mot de passe pgAdmin en direct ?' 
                  : 'Why does the PostGIS tool not ask for my pgAdmin database password directly?'}</span>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-amber-500 shrink-0" />
              </summary>
              <div className="mt-2.5 pt-2 border-t border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 space-y-1.5 leading-relaxed font-sans">
                <p>
                  {lang === 'fr'
                    ? 'OmniGeo respecte le principe de sécurité "Zero Trust" et n\'a pas de backend distant stockant vos mots de passe. Il génère pour vous un script SQL prêt à l\'emploi avec index spatial GiST que vous ouvrez et exécutez directement dans votre pgAdmin 4 local où vos identifiants sont déjà protégés.'
                    : 'OmniGeo adopts a Zero-Trust client architecture and has no backend server storing passwords. It generates an optimized SQL script with GiST spatial indexing that you execute directly inside pgAdmin 4 where your credentials remain strictly local and private.'}
                </p>
              </div>
            </details>

            {/* Q4: Africa zoom & feature zoom */}
            <details className={`p-3.5 rounded-xl border group transition-colors ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#14100D] border-stone-800'
            }`}>
              <summary className="font-bold cursor-pointer flex items-center justify-between text-stone-800 dark:text-stone-200">
                <span>{lang === 'fr' 
                  ? 'Comment zoomer sur une entité spécifique dans la carte ?' 
                  : 'How do I zoom directly into a specific feature on the map?'}</span>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-amber-500 shrink-0" />
              </summary>
              <div className="mt-2.5 pt-2 border-t border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 space-y-1.5 leading-relaxed font-sans">
                <p>
                  {lang === 'fr'
                    ? 'Dans l\'onglet "Studio carto", déployez la table attributaire en cliquant sur le bouton en bas de la carte. Cliquez simplement sur n\'importe quelle ligne du tableau pour déclencher un zoom fluide, un halo lumineux pulsant et une bulle d\'informations sur cette entité précise !'
                    : 'In "Map Studio", expand the attribute table drawer at the bottom of the map canvas. Click any row in the table to trigger smooth map panning, a pulsing highlight outline, and a pop-up display with all feature attributes!'}
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* 7. FOOTER */}
        <footer className={`pt-6 pb-8 border-t flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono transition-colors ${
          theme === 'light' ? 'border-[#E2DBD0] text-stone-500' : 'border-stone-800 text-stone-400'
        }`}>
          <div className="flex items-center space-x-2.5">
            <Logo size={22} />
            <span className={`font-semibold ${theme === 'light' ? 'text-stone-800' : 'text-stone-200'}`}>
              OmniGeo by Maodo
            </span>
            <span className="text-stone-400">·</span>
            <span>Apache 2.0 Open Source</span>
          </div>

          <div className="flex items-center space-x-4">
            <button 
              onClick={() => onLaunchWorkbench('craft')} 
              className="text-amber-600 dark:text-amber-400 hover:underline font-bold flex items-center space-x-1"
            >
              <span>{lang === 'fr' ? 'Ouvrir l\'Atelier' : 'Open Workbench'}</span>
            </button>
            <a 
              href={githubRepoUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-stone-800 dark:hover:text-stone-200 flex items-center space-x-1"
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </footer>

      </div>
    </div>
  );
};
