# Auto Voice Join for Vencord

A private Vencord user plugin that watches selected server voice channels and automatically joins when another user enters one.

## Install

1. Build Vencord from source by following the [official instructions](https://docs.vencord.dev/installing/).
2. Copy this repository folder to `Vencord/src/userplugins/autoVoiceJoin`.
3. From the Vencord source folder, run `pnpm build` and `pnpm inject`.
4. Fully restart Discord.
5. Open **User Settings → Vencord → Plugins**, find **AutoVoiceJoin**, and enable it.

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

