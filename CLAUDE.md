# 5000 Command Center

## UI work

- Follow `design-system/5000-command-center/MASTER.md`; a file in `design-system/5000-command-center/pages/` overrides it for that page.
- Tokens live in `app/styles/tokens.css`. Use them — no raw hex, font sizes or radii off the scale.
- Use the `ui-ux-pro-max` skill (`.claude/skills/ui-ux-pro-max`) for UX rules and the pre-delivery checklist.

## Layout

- `app/page.tsx`: the shell (data loading, navigation, view switching).
- `app/views/`: one file per view.
- `app/styles/`: one stylesheet per area, imported in order by `app/globals.css`.
