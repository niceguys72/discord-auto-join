<p align="center">
  <img src="assets/auto-voice-join-badge-readme.png" alt="Auto Voice Join mascot" width="220">
</p>

<h1 align="center">Auto Voice Join for Vencord</h1>

<p align="center">
  <strong>Watch selected voice channels and automatically join when someone arrives.</strong>
</p>

<p align="center">
  Private Vencord user plugin · Multi-channel watchlist · Active-channel protection
</p>

## Install

1. Build Vencord from source by following the [official instructions](https://docs.vencord.dev/installing/).
2. Copy this repository folder to `Vencord/src/userplugins/autoVoiceJoin`.
3. From the Vencord source folder, run `pnpm build` and `pnpm inject`.
4. Fully restart Discord.
5. Open **User Settings → Vencord → Plugins**, find **AutoVoiceJoin**, and enable it.

### Automated Windows setup (PowerShell)

Install [Git](https://git-scm.com/download/win) and Node.js `22.13.0` or newer first. Then open a normal, non-Administrator PowerShell window and paste the complete script below. It installs the Vencord-pinned pnpm version, creates or updates both repositories under `Documents`, builds Vencord, and launches the installer.

```powershell
$ErrorActionPreference = "Stop"
$vencordDir = Join-Path $env:USERPROFILE "Documents\Vencord"
$pluginDir = Join-Path $vencordDir "src\userplugins\autoVoiceJoin"

function Assert-Command([string]$Name, [string]$InstallMessage) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is not installed. $InstallMessage"
    }
}

function Assert-Success([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE."
    }
}

function Add-SafeGitDirectory([string]$Path) {
    $safePath = $Path.Replace("\", "/")
    $existing = @(git config --global --get-all safe.directory 2>$null)
    if ($existing -notcontains $safePath) {
        git config --global --add safe.directory $safePath
        Assert-Success "Adding Git safe directory $safePath"
    }
}

Assert-Command "git" "Install Git from https://git-scm.com/download/win"
Assert-Command "node" "Install a current Node.js LTS release from https://nodejs.org/"
Assert-Command "npm" "Reinstall Node.js and include npm"

$nodeVersion = [version]((node --version).TrimStart([char]"v"))
if ($nodeVersion -lt [version]"22.13.0") {
    throw "Node.js 22.13.0 or newer is required. Installed version: $nodeVersion"
}

$npmPrefix = (npm config get prefix).Trim()
if (($env:Path -split ";") -notcontains $npmPrefix) {
    $env:Path += ";$npmPrefix"
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue) -or (pnpm --version) -ne "11.9.0") {
    npm install --global pnpm@11.9.0
    Assert-Success "Installing pnpm"
}

if (-not (Test-Path (Join-Path $vencordDir ".git"))) {
    if (Test-Path $vencordDir) {
        throw "$vencordDir already exists but is not a Git repository. Move or rename it, then rerun this script."
    }
    git clone https://github.com/Vendicated/Vencord.git $vencordDir
    Assert-Success "Cloning Vencord"
}

Add-SafeGitDirectory $vencordDir
git -C $vencordDir pull --ff-only
Assert-Success "Updating Vencord"

if (-not (Test-Path (Join-Path $pluginDir ".git"))) {
    if (Test-Path $pluginDir) {
        throw "$pluginDir already exists but is not a Git repository. Move or rename it, then rerun this script."
    }
    git clone https://github.com/niceguys72/discord-auto-join.git $pluginDir
    Assert-Success "Cloning Auto Voice Join"
}

Add-SafeGitDirectory $pluginDir
git -C $pluginDir pull --ff-only
Assert-Success "Updating Auto Voice Join"

Push-Location $vencordDir
try {
    pnpm install --frozen-lockfile
    Assert-Success "Installing Vencord dependencies"
    pnpm build
    Assert-Success "Building Vencord"
    pnpm inject
    Assert-Success "Launching the Vencord installer"
} finally {
    Pop-Location
}
```

When the installer opens, select the Discord installation and patch it. Fully quit Discord from the system tray and reopen it afterward.

### Automated update (PowerShell)

After a plugin update, paste this into PowerShell to pull, rebuild, and launch the installer again:

```powershell
$vencordDir = Join-Path $env:USERPROFILE "Documents\Vencord"
$pluginDir = Join-Path $vencordDir "src\userplugins\autoVoiceJoin"
$vencordSafe = $vencordDir.Replace("\", "/")
$pluginSafe = $pluginDir.Replace("\", "/")

$safeDirectories = @(git config --global --get-all safe.directory 2>$null)
if ($safeDirectories -notcontains $vencordSafe) {
    git config --global --add safe.directory $vencordSafe
}
if ($safeDirectories -notcontains $pluginSafe) {
    git config --global --add safe.directory $pluginSafe
}
git -C $pluginDir pull --ff-only

Push-Location $vencordDir
try {
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "Vencord build failed." }
    pnpm inject
} finally {
    Pop-Location
}
```

## Select channels

Right-click a server voice or stage channel and enable **Auto-join when someone enters**. Repeat for every channel you want to watch.

To stop watching a channel, right-click it and clear the same option. The selected channels are saved in Vencord's plugin settings.
Watched channel names are highlighted in green in the channel list so they are easy to identify.

## Behavior and limitations

- The plugin reacts only when another user joins or moves into a watched channel; your own voice-state changes are ignored.
- The plugin does not move you between channels: if you are already connected to voice, activity in other watched channels is ignored.
- Discord may still show its normal connection confirmation or fail to connect if you do not have permission, the channel fills up, or the client is otherwise unable to join.
- Vencord user plugins depend on Discord's internal modules and can occasionally require updates after Discord changes.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

