# SIDOKTER Login 1.0.7 — Consistent Viewport Scale

## Change
Login panel, institution header and login card now use one shared responsive width:
`min(360px, calc(100vw - 28px))`.

This keeps the visual size consistent across desktop, tablet and phone while allowing only physically narrow screens to shrink to fit.

## Branding
Secondary logo + coded SIDOKTER lockup remains capped at 80% of the login card width.

## Safety
No authentication, Firebase, API, session, routing, or workflow code changed.
