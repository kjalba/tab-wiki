# Publishing tab-wiki

The complete release + store-submission runbook.
Store listing text, permission justifications, and reviewer notes live in [store-listing.md](store-listing.md).

## 1. Cut a GitHub release

```sh
git tag v<X.Y.Z> && git push origin v<X.Y.Z>
```

The `release` workflow builds Companion binaries (macOS/Linux, arm64/amd64),
extension zips, the `.xpi`, and checksums, and publishes them on the release.
`install/get.sh` always pulls from the latest release.

Bump `version` in both extension manifests and `extension/package.json` before tagging
(stores reject re-uploads of the same version).

## 2. Build the store packages

```sh
./scripts/package-store.sh
```

Produces in `extension/dist/store/` (never committed - the Chromium zip contains the private key):

- `tab-wiki-chromium-store.zip` - Chrome Web Store upload
- `tab-wiki-firefox-store.zip` - AMO upload

## 3. Chrome Web Store (Chrome, Helium, Chromium forks)

One-time setup:

1. Register at https://chrome.google.com/webstore/devconsole ($5 one-time fee, Google account).
2. "New item" > upload `tab-wiki-chromium-store.zip`.
   The zip includes `key.pem` on purpose: it makes the store keep the extension ID
   `dekbipliihgnonlenepdooagogfibkgo`, which the installer's native-messaging
   manifests already allow. If the store assigns a different ID anyway, update
   `CHROMIUM_EXT_ID` in `install/install.sh` + `install/get.sh` and re-release.
3. Fill the listing from `store-listing.md` (description, category, screenshots).
4. Privacy tab: paste the permission justifications from `store-listing.md`,
   privacy policy URL `https://github.com/kjalba/tab-wiki/blob/main/docs/PRIVACY.md`,
   declare "no data collected".
5. Submit for review. Broad host permissions mean review can take days to a
   couple of weeks. The reviewer notes in `store-listing.md` explain the
   native-messaging companion (same pattern as password managers).

Updates: bump version, rerun `package-store.sh`, upload the new zip (key.pem is
only needed on the first upload; harmless to keep including).

## 4. Firefox Add-ons / AMO (Firefox, Zen)

1. Account at https://addons.mozilla.org (free), then https://addons.mozilla.org/developers/.
2. "Submit a New Add-on" > "On this site" (listed) > upload `tab-wiki-firefox-store.zip`.
3. When asked whether the code is minified/bundled: yes (esbuild, unminified) -
   upload a source zip of the repo (`git archive -o source.zip HEAD`) and note
   the build steps: `cd extension && npm install && npm run build`.
4. Fill the listing from `store-listing.md`; privacy policy URL as above.
5. Submit. Once approved, users install normally - no `about:config` flip.

The add-on ID `tabwiki@kjalba.dev` is pinned in the manifest, so signed builds
keep working with the installer's native-messaging manifests unchanged.

## 5. After both approvals

- Replace the "link pending review" placeholders in README Quick start step 2
  with the real store URLs.
- Optionally delete the unsigned-`.xpi` instructions from the README.

## Store-independent bits (never change)

- The Companion is installed by `install/get.sh` regardless of where the
  extension came from - stores cannot ship native binaries.
- Native-messaging manifests bind to the extension IDs above; they are written
  by the installer, not by the stores.
