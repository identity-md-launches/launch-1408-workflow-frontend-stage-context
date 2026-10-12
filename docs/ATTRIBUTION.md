# Attribution and implementation references

The visual and interaction review applies the pinned **Better Interface** guide by Jakub Krehel, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. The implemented-design documentation follows the adapted **Impeccable** document method by Paul Bakaus, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. The combined supplied notices and licenses are preserved in [licenses/Better-Interface-and-Impeccable.txt](licenses/Better-Interface-and-Impeccable.txt).

Ethereum interface guidance uses the supplied adaptation of Austin Griffith's **ethskills frontend-ux**, MIT, commit `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`. Its supplied license/provenance notice is preserved in [licenses/Ethereum-Frontend-UX.txt](licenses/Ethereum-Frontend-UX.txt). The pinned guides were read locally; their upstream pages were not fetched.

The frontend uses React, Vite, TypeScript and viem through normal package dependencies, with exact installed versions recorded in `web/package-lock.json`. No dependency archive or registry mirror is part of this deliverable.

Space Grotesk and DM Sans use the SIL Open Font License. Font copyright and license files accompany the export at `dist/licenses/` and their source copies at `web/public/licenses/`. Only the four WOFF2 faces used by this page are included in the static export.

Uniswap interfaces and routing were checked against the primary developer references: [v4 swap routing](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/routing) and [v4 quoting](https://developers.uniswap.org/docs/sdks/v4/guides/swapping/quoting). Deployment addresses were taken exclusively from the supplied deployment/network records, not from those references. The task's exact attested pool and router encoding requirements govern the implementation.
