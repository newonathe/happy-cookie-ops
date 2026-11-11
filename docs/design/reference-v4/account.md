# Account — supplied reference page contracts

Read ../reference-v4-page-contracts.md for source, capture method and proof limits. Actual-app parity remains incomplete.

## account — Account

- Structure: Account → People & access → Health & backups → Shop settings → Make settings → Stock settings → Money settings
- Captured controls: Open; Sign out
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/account-baseline-1440.png; screenshots/account-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## people — People & access

- Structure: People & access → Cine → Alex
- Captured controls: Add person; View access
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/people-baseline-1440.png; screenshots/people-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## person-edit — Add person

- Structure: Add person
- Captured controls: Back to people; Save access
- Fields: text; email; Role
- Reference images: screenshots/person-edit-baseline-1440.png; screenshots/person-edit-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## health — Health & backups

- Structure: Health & backups
- Captured controls: Backups & export
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/health-baseline-1440.png; screenshots/health-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## backups — Backups & export

- Structure: Backups & export → Restore a saved preview
- Captured controls: Download sample backup; Export books CSV
- Fields: hc-restore-file
- Reference images: screenshots/backups-baseline-1440.png; screenshots/backups-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## restore-preview — Review restore

- Structure: Review restore
- Captured controls: Keep current work; Restore preview
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/restore-preview-prepared-1440.png; screenshots/restore-preview-prepared-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## sign-out — Sign out

- Structure: Sign out
- Captured controls: Keep working; Sign out on this browser
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/sign-out-baseline-1440.png; screenshots/sign-out-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## sign-in — Sign in

- Structure: Sign in
- Captured controls: Show password; Account help; Sign in to preview
- Fields: hc-demo-email; hc-demo-password
- Reference images: screenshots/sign-in-baseline-1440.png; screenshots/sign-in-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## account-help — Account help

- Structure: Account help
- Captured controls: Back to sign in
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/account-help-baseline-1440.png; screenshots/account-help-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## reset-preview — Reset sample

- Structure: Reset sample
- Captured controls: Keep my work; Reset sample data
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/reset-preview-baseline-1440.png; screenshots/reset-preview-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## record-unavailable — Record unavailable

- Structure: Record unavailable
- Captured controls: Return to the list
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/record-unavailable-baseline-1440.png; screenshots/record-unavailable-baseline-390.png
- Existing source: src/components/live/owner-workspace.tsx; src/components/app/live-gate.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.
