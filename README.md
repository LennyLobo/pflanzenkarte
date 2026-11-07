# PflanzenKarte

Web-App (PWA) für Android: Pflanzenfunde mit Foto und GPS auf dem amtlichen Luftbild Niedersachsen erfassen.
Alle Funde und Fotos bleiben im Browser-Speicher des Geräts; nichts wird hochgeladen.

- Luftbild: LGLN Niedersachsen, DOP20 (WMS `dop_wms`, Layer `ni_dop20`), Lizenz CC BY 4.0, Quellenvermerk „LGLN (Jahr)“
- Karte: © OpenStreetMap-Mitwirkende
- Export: CSV (Excel, `;`-getrennt) und GeoJSON (QGIS), mit WGS84- und ETRS89/UTM32-Koordinaten

Entwicklung: `npm install`, `npm run dev`. Jeder Push auf `main` wird per GitHub Actions nach GitHub Pages gebaut.
