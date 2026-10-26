# Sensors pack

Organise weather, soil, and irrigation map pins: names, input source stubs, and a coverage radius (1 m to 50 km). Paddocks that meet the circle are assigned automatically. A manual paddock list replaces that match. Place the dots on Farm Map → Infrastructure. This pack does not own the pins, and Delete does not remove them.

Bindings live at `farms/{id}/settings/sensors`. Live DPIRD / vendor polling is not in this version.

```bash
npm run plugins:verify -- plugins/sensors
```
