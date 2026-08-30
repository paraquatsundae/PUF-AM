import { PUFAM_FILL_PATTERN_CSS } from '../../lib/infraMapStyles';
import { PUFAM_TRACK_STROKE_CSS } from '../../lib/trackMapStyles';

export function OrchardMapLeafletStyles() {
  return (
          <style>{`
            ${PUFAM_FILL_PATTERN_CSS}
            ${PUFAM_TRACK_STROKE_CSS}
            path.smooth-polygon-transition {
              transition: fill 0.15s ease-out, stroke 0.15s ease-out;
            }
            .leaflet-editing-icon {
              width: 14px !important;
              height: 14px !important;
              margin-left: -7px !important;
              margin-top: -7px !important;
              border-radius: 50% !important;
              background-color: white !important;
              border: 2px solid #4f46e5 !important;
            }
            .leaflet-draw-tooltip {
              background: #1e293b !important;
              border: 1px solid #334155 !important;
              color: white !important;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
            }
            .leaflet-draw-tooltip-single { margin-top: -12px !important; }
            .leaflet-draw-tooltip-subtext { color: #94a3b8 !important; }
            .leaflet-draw-tooltip::before { border-right-color: #334155 !important; }
            /* React DrawingActionBar owns Finish/Undo/Cancel — hide stock menu (ghost taps). */
            .leaflet-container.pufom-using-draw-bar .leaflet-draw-actions {
              display: none !important;
              pointer-events: none !important;
            }
            /* Plus / Add pad / Add hazard / Edit boundary are the only draw entry points. */
            .orchard-map-leaflet .leaflet-draw {
              display: none !important;
              pointer-events: none !important;
            }
            /* Paddock/track fills must not steal tap-to-vertex (survives highlight setStyle). */
            .leaflet-container.pufom-draw-over-paddocks .leaflet-overlay-pane path,
            .leaflet-container.pufom-using-draw-bar .leaflet-overlay-pane path {
              pointer-events: none !important;
            }
            .pufom-boundary-vertex {
              background: transparent !important;
              border: none !important;
            }
            .leaflet-container.pufom-boundary-editing {
              cursor: crosshair;
            }
            @media (max-width: 640px) {
              .leaflet-draw-toolbar a {
                width: 36px !important;
                height: 36px !important;
                line-height: 36px !important;
              }
              .leaflet-bar a {
                width: 36px !important;
                height: 36px !important;
                line-height: 36px !important;
              }
            }
            .leaflet-container {
              touch-action: none;
            }
            /* Zoom sits bottomright; keep it clear of the attribution strip. */
            .orchard-map-leaflet .leaflet-bottom.leaflet-right .leaflet-control-zoom {
              margin-bottom: 28px;
            }
            .orchard-map-leaflet .leaflet-control-attribution {
              max-width: min(42vw, 220px);
              font-size: 10px;
              line-height: 1.25;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              background: rgba(255, 255, 255, 0.72);
            }
            .pufom-user-location-icon {
              background: transparent !important;
              border: none !important;
            }
            .pufom-user-loc {
              position: relative;
              width: 28px;
              height: 28px;
            }
            .pufom-user-loc__pulse {
              position: absolute;
              inset: 0;
              border-radius: 9999px;
              background: rgba(37, 99, 235, 0.35);
              animation: pufom-user-pulse 2s ease-out infinite;
            }
            .pufom-user-loc__dot {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 14px;
              height: 14px;
              margin: -7px 0 0 -7px;
              border-radius: 9999px;
              background: #2563eb;
              border: 3px solid #fff;
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
            }
            @keyframes pufom-user-pulse {
              0% { transform: scale(0.55); opacity: 0.85; }
              70% { transform: scale(1.35); opacity: 0; }
              100% { transform: scale(1.35); opacity: 0; }
            }
            .pufom-crew-presence-icon {
              background: transparent !important;
              border: none !important;
            }
            .pufom-crew-loc {
              position: relative;
              width: 22px;
              height: 22px;
            }
            .pufom-crew-loc__dot {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 14px;
              height: 14px;
              margin: -7px 0 0 -7px;
              border-radius: 9999px;
              background: var(--crew-colour, #0f766e);
              border: 2px solid #fff;
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
            }
            @keyframes pufom-hl-pulse {
              0%, 100% { fill-opacity: 0.16; stroke-opacity: 0.75; }
              50% { fill-opacity: 0.38; stroke-opacity: 1; }
            }
            .pufom-map-highlight-poly {
              animation: pufom-hl-pulse 1.6s ease-in-out infinite;
            }
            .pufom-highlight-wm {
              background: transparent !important;
              border: none !important;
            }
            .pufom-highlight-wm__label {
              font: 700 12px/1.2 system-ui, sans-serif;
              color: var(--hl-colour, #0f766e);
              text-align: center;
              white-space: nowrap;
              text-shadow:
                0 0 3px #fff,
                0 0 6px #fff,
                1px 1px 0 #fff,
                -1px -1px 0 #fff,
                1px -1px 0 #fff,
                -1px 1px 0 #fff;
              pointer-events: none;
            }
            .pufom-paddock-name {
              background: transparent !important;
              border: none !important;
            }
            .pufom-paddock-name__label {
              font: 800 13px/1.15 system-ui, sans-serif;
              color: #f8fafc;
              text-align: center;
              white-space: nowrap;
              letter-spacing: 0.01em;
              text-shadow:
                0 0 4px rgba(0,0,0,.85),
                0 1px 2px rgba(0,0,0,.9),
                1px 1px 0 rgba(0,0,0,.75),
                -1px -1px 0 rgba(0,0,0,.75);
              pointer-events: none;
            }
          `}</style>
  );
}
