# Maintenance center

Settings → Maintenance center is split into five tabs: **Update** (app version, updates and the auto-update switch), **Plugins** (installed list, search, update / rollback / enable / uninstall), **Add** (GitHub sources, install from npm, the GitHub token and the folder shortcuts — every input and the open-plugins / open-config / open-safe-mode buttons live here), **Performance** (FPS, long tasks and the degrade switches) and **Typewriter** (gradual reveal, stream throttle and speed).

## What it checks

- **App**: reads `app-update.yml` from the installed desktop app's `resources` directory, follows the generic update feed it names (for example `https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml`) and compares the feed's `version` with the installed app version. When a new version exists, the desktop card shows **Check again / Update / Cancel**: Update calls the shell's own updater (`window.dshDesktop.updates.open()`), and the panel itself never opens a window; Cancel only hides the card until the next check. The Web surface has no native updater and falls back to the download page. The card also links to the GitHub releases page for a manual download.
- **npm plugins**: asks the plugin manager's `listVersions` for the installed registry copy, using the same registry and compatibility checks the plugin manager uses.
- **GitHub plugins**: for a plugin installed from a Git repository, asks GitHub for the latest release tag (falling back to tags), resolves the tag to a full commit, and compares that version with the installed one.

## Updating

The **Update** button calls the plugin manager's `updateBundle`, so pnpm, the compatibility check, rollback of a failed installation and the restart outcome are owned by the plugin manager. A registry plugin updates to the exact newer version. A GitHub plugin updates to the Git spec that pins the resolved commit. The page reports when a restart is required.

**Update all** runs the same operation for every plugin that reports an update, one at a time.

**Auto-update** applies the same operation automatically after a check that finds updates. The switch is stored in the browser, and is on by default.

When a batch update finishes (auto-update or **Update all**), a result banner appears at the top of the page: one row per plugin with its version change and **Updated / Failed**, plus a hint to restart DSH. **Got it** dismisses it. The banner lives in the frame-wide overlay, so it survives closing the settings page until dismissed.

A single update uses the same top popup: with a restart it reads "Update finished — restart required" with a **Restart app** button; without one it reads "Update finished" with a **Reload UI** button. The detail names the plugin and its new version, and **Got it** dismisses it.

A detected update is announced as the same top banner, never as a popup: **Update available** with the version change and **Update / Got it**; only pressing Update enters the desktop shell's own update flow.

The app itself is only shown as updatable when the desktop shell reports an update (a newer feed/mirror version alone does not count), and only then does the Update button call the shell's updater.

Once the app update starts downloading, the top banner switches to a progress state: **Downloading update** with the version and percentage, and a 3px progress bar along the banner's bottom edge (light track, brand fill). Installing/starting shows a looping animation instead of a percentage, and the banner disappears when the phase ends.

Each npm-installed plugin row also has a **Rollback** button that lists every published version on the mirror (up to 50, current version marked); **Install** switches to that version. Rollback removes and reinstalls the package (the manager's update API only accepts newer versions) and restores the previous version if the install fails. GitHub and local installs are not supported yet.

When an update needs a restart (host-module plugins), the notice and the batch result banner offer **Restart app**. The sidebar foot also carries a **Reload & restart** dropdown with **Reload UI** and **Restart app** inside it.

- **Reload UI** only reloads the page and client plugins (`location.reload()`).
- **Restart app** calls the update center's own `POST /dsh-concierge/restart`: the Host creates a PowerShell helper through WMI (outside the app's process tree), which kills the Electron main process and relaunches the app, retrying up to 3 times and logging to `~/.dsh/update-center/restart.log`. It no longer depends on dsh-desktop-restart.

## GitHub sources (multiple)

The plugins tab starts with a **GitHub sources** card: enter `owner/repo` or a full GitHub URL and press **Add**; any number of repos can be watched. Each source is checked against its latest release (falling back to tags):

- not installed → "latest x.y.z · not installed" with an **Install** button;
- installed → "latest · installed version", marked **update** when newer, with a **Reinstall** button;
- **Remove** only drops the watch entry, it never uninstalls the plugin.

The list lives in `~/.dsh/update-center/github-sources.json`.

Some plugins install in several steps (install, restart, configure in settings, restart again — `XRH66/dsh-memory-starter` is one). Each source row has a **Steps** button: it reads the numbered items of the repository README's quick-start / install section and shows them as a checklist with **Restart app** and **Open repo** buttons; the checklist opens automatically after installing from that row.

## Install from Git

The plugins tab has an input: paste a GitHub URL (`https://github.com/owner/repo` or `github:owner/repo`) and it installs. The install resolves the repository HEAD to a full commit first, so the plugin lands as a pinned Git install that later checks and rollbacks can recognise.

Git plugins follow "GitHub releases (falling back to tags) → download → install": updates call `updateBundle` with the pinned spec, and fall back to "remove + reinstall from the target spec" when the manager refuses the spec form. Rollback lists up to 100 tags, newest first.

## Local plugins

Local installs (`link:` / `file:`) have no registry and no release feed, so the source itself is inspected:

- a source directory's `package.json` version is compared with the installed one;
- a Git checkout records its current commit, and a changed commit or version offers a reinstall;
- `link:` installs are already live, so they only report that;
- a `.tgz` source has its inner `package.json` version read and its size+mtime remembered; a replaced tarball reports "source tarball updated" and can be reinstalled in one click (remove + install from the original spec).

## Install and uninstall

- **Install from npm**: a card on the plugins tab takes a package name (`dsh-pet`) or name plus version (`dsh-pet@0.4.9`).
- **Uninstall**: every row ends with **Uninstall**; the first click becomes **Confirm uninstall?** and only the second one removes the plugin. The maintenance center itself has no uninstall button.
- **Ignore this version**: skip an update without disabling the plugin; the row then shows "Ignored x.y.z" with an **Unignore** button. The list is stored in the browser.
- **What's new**: GitHub-installed plugins with release notes get a **What's new** toggle that expands the release body.
- **Diagnosis**: common plugin-manager codes (`invalid-spec`, `incompatible-version`, `pendingBuilds`, `not-removable`, `bundle-in-use`, …) are translated into a plain-language hint and next step.

## Safe mode

When a broken plugin keeps the app from starting, the plugin itself never gets to run — so on startup it writes scripts to `~/.dsh/update-center/`:

- **`safe-mode.cmd`** backs up the profile's `package.json` and `cordis.patch.yml` into `safe-backup/`, filters `dsh.profile.bundles` down to official bundles (`@deepseek-ai/*`), then launches the app;
- **`restore-mode.cmd`** restores the backup and restarts;
- **`safe-launch.cmd`** is the automatic version: it starts the app, watches it for 30 seconds, and if the process did not survive it backs up, switches to safe mode and starts again.

Point the desktop shortcut at `safe-launch.cmd` and a failed start lands in safe mode on its own.

The **Automatic safe mode** switch in the Add tab's folders card (stored as `safeModeAuto` in `~/.dsh/update-center/settings.json`, on by default) controls that behaviour: on, `safe-launch.cmd` watches the first 30 seconds and falls back; off, it only starts the app. Flipping it rewrites the scripts immediately.

All scripts need the app closed and no administrator rights; the `.ps1` files carry a UTF-8 BOM so Windows PowerShell 5.1 reads the Chinese text correctly.

## GitHub token

The update tab takes a GitHub token (`ghp_…` / `github_pat_…`), stored in `~/.dsh/update-center/settings.json`:

- without one the GitHub API allows 60 requests/hour per IP, which a few sources exhaust;
- with one it is 5,000 requests/hour per account.

A public-repo read-only token is enough. The `GITHUB_TOKEN` / `GH_TOKEN` environment variables take precedence. Saving applies immediately, no restart.

## Background check

The client plugin stays loaded and checks for updates every 10 minutes; when plugins can be updated it shows a top banner ("N plugin update(s) available"), at most once an hour, dismissible with **Got it**.

## Enable, disable and roll back

Every plugin row also carries **Enable / Disable**, which goes through the plugin manager's `setPluginEnabled` and applies immediately (a few plugins need a restart). Registry plugins can roll back to any published version (up to 100); GitHub plugins roll back to any tag in the repository; local directory or tarball installs have no version list to roll back to.

If a plugin failed to load after the last update, the Host disables it on the next start and the page shows a banner ("N plugins failed to load and were disabled") with **Enable all**.

The plugins tab header has **Open plugins folder** and **Open config**, which open the profile's `node_modules` and `cordis.patch.yml`.

## Chat performance

Four numbers: FPS (5-second average, shown as "current / screen refresh" — the ceiling follows the display refresh rate, detected among 60/75/90/100/120/144/165/240 or set by hand in the **Refresh rate** row), rendered chat rows, long-task count and total blocking time over the last 10 seconds, plus an 80-second bar history of long tasks and its peak. Four switches:

- **Auto degrade**: below 75% of the refresh rate for two seconds, `<html>` gets `data-dsh-perf="low"`, which drops animations, transitions, `backdrop-filter` and shadows inside the conversation; three seconds above 90% restore it.
- **Long-chat lite**: above 60 rows, `data-dsh-perf="long"` drops animations and transitions in the chat flow.
- **Force lite**: always stay in lite mode.
- **Skip offscreen rows**: enabled only above 40 rendered rows; each row gets `content-visibility: auto` with its **measured height** in `contain-intrinsic-size: auto <height>px` (not a fixed placeholder), applied from idle time in small slices so the scan itself does not jank; turn it off if scrolling ever misbehaves.

While a reply is streaming (`[data-phase="active"]`), the conversation's `backdrop-filter` is dropped until the stream ends.


## Typewriter

The page ends with a **Typewriter** card: a reveal switch and a speed slider (10–240 characters per second). It wraps the built-in `assistant-step` renderer and only paces the streaming text block; reasoning, tool rows and images stay native. The inner render commits at most every 50ms, and it stands down on low frame rates.

## Limits

- The app itself is never replaced from this page.
- GitHub requests are unauthenticated unless `GITHUB_TOKEN` or `GH_TOKEN` is set in the Host environment, so they share GitHub's anonymous rate limit.
- Plugins installed from a local directory or tarball are listed but not checked.
- Results are cached for five minutes; **Check for updates** bypasses the cache.
