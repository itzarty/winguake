# WinGuake 🖥️

[![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078d7.svg?style=flat-square&logo=windows)](https://github.com/)
[![Electron](https://img.shields.io/badge/framework-Electron-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Status: Beta](https://img.shields.io/badge/status-beta-orange?style=flat-square)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)

<p align="center">
    <img src="https://i.imgur.com/s6MNcHM.gif" width="500" />
</p>

A drop-down terminal for Windows inspired by Guake. Built with Electron, Xterm.js, and `node-pty`, WinGuake aims to provide a seamless terminal experience that stays out of your way until you need it.

## 🚀 Key Features

*   **Relative Positioning:** Unlike standard fixed-width terminals, WinGuake offers full position and size adjustments that scale **relatively** to your screen size.
*   **Ghost Mode 👻:** Hold down your assigned keybind to make the window highly translucent, unfocus it, and enable **click-through** functionality. Interact with the windows behind the terminal without hiding it.
*   **Tabbed Instances:** Manage multiple shell sessions within a single window. Internally powered by `node-pty` for a true native terminal feel.
*   **Native Windows Integration:** Right-click a **file** to run it in WinGuake or right-click a **directory** to open a new terminal instance in that location.

<p align="center">
    <img src="https://s5.ezgif.com/tmp/ezgif-52f096d6eae3097b.gif" width="500" />
</p>

## 🛠️ Customization

Customize your experience through the settings:
*   **Visuals:** 
    *   Terminal Opacity (adjusts Xterm.js background transparency).
    *   Cursor Style (Block, Underline, or Bar).
*   **Typography:** 
    *   Font Family (automatically pulled from your OS fonts).
    *   Adjustable Font Size.
*   **Behavior:** 
    *   Default Shell selection.
    *   Run on Startup.
    *   Starting Directory.

<p align="center">
    <img src="https://i.imgur.com/RY2gciR.gif" width="250" />
    <img src="https://i.imgur.com/CC8PCi9.gif" width="250" />
</p>

## ⌨️ Default Keybindings

| Action | Description |
| :--- | :--- |
| **Toggle Visibility** | Show/Hide the terminal. |
| **New Instance** | Create a new tab/node-pty instance. |
| **Kill Instance** | Close the current tab. |
| **Toggle Size** | Switch between Fullscreen and Restored size. |
| **Ghost Mode** | Hold to trigger transparency/click-through. |

> *Note: Ghost Mode is active only while the keybind is held down.*

## 📦 Installation

1.  Download the latest appropriate executable for your platform (`.exe`, `.deb`, `.AppImage`) from the [Releases](https://github.com/itzarty/winguake/releases) page.
2.  Install the package.
    * **AppImage** Run `./WinGuake-x.x.x.AppImage` (*no installation, requires FUSE*)
    * **deb** Run `sudo dpkg -i ./winguake_x.x.x_arch.deb`, wait for the package to install
    * **exe** Proceed through the *NSIS* installer
3.  You're good to go!

## 🗺️ Roadmap

- [x] Full Windows Support
- [x] Linux Support
- [x] Theme/Color Palette Support
- [x] Presets
- [ ] Advanced configuration
- [ ] Layouts and themes
- [ ] Tab groupping and labelling
- [ ] Codebase clean-up

---

*Built with ❤️ for the Windows developer community.*

*...and yes, AI was used to create this README.md, unlike the rest of the project*
