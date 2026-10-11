# Robot Game

This is a browser-based version of the robot collector game, rebuilt without Godot.

It keeps the same general gameplay ideas as the Godot prototype:
- collect scrap
- unlock robots and weapon upgrades
- customize robot color
- fight enemies
- persist progress using local storage

## Run locally

Open the project in a static web server, for example:

python -m http.server 8000

Then visit:

http://localhost:8000

## Controls

Desktop:
- WASD: move
- Mouse: look around
- Left click: fire weapon
- Right click: melee
- 1 / 2: switch weapons
- Shift: sprint

Mobile:
- On-screen joystick: move
- Fire and melee buttons: attack
- Weapon buttons: switch weapons

## Notes

This is a separate browser-friendly project created to avoid depending on Godot. The original Godot repository was left unchanged.
