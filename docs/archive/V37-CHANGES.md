# Skillforge V37 changes

## IMS visual rebrand
- Replaced the warm orange/tan visual system with an IMS blue and green system.
- Primary interactive and focus colour: IMS blue `#1F4E79`.
- Dark navigation and headings: deep navy `#16324F`.
- Positive and secondary accents retain the established green family (`#3E8E7E`, `#14B8A6`, `#22C55E`).
- Warm cream surfaces, borders and muted text were converted to cool blue-grey equivalents.
- Destructive/error semantics remain red rather than being recoloured green.
- Updated certificate artwork and chart palettes along with the source UI.

## Scope control
- No LMS workflows, permissions, report calculations, SQL migrations, RLS policies, routes or role logic were intentionally changed.
- `dist/` is regenerated from `public/` by the existing build command.

## Verification
- Run `npm test`, `npm run test:e2e`, `npm run test:db`, `npm run test:load`, `npm run build`, and the repository CI/security workflows in an environment with their declared dependencies.
