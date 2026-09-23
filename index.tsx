/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2026 AxeMa
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, Menu, SelectedChannelStore, showToast, Toasts, UserStore } from "@webpack/common";

interface VoiceStateChangeEvent {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
}

const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");

const settings = definePluginSettings({
    watchedChannelIds: {
        type: OptionType.STRING,
        description: "Voice channel IDs watched by Auto Voice Join (normally managed from channel context menus)",
        default: ""
    },
    showJoinToast: {
        type: OptionType.BOOLEAN,
        description: "Show a notification when Auto Voice Join connects to a watched channel",
        default: true
    }
});

function getWatchedChannelIds() {
    return new Set(settings.store.watchedChannelIds.split(",").map(id => id.trim()).filter(Boolean));
}

function setChannelWatched(channelId: string, watched: boolean) {
    const channelIds = getWatchedChannelIds();
    watched ? channelIds.add(channelId) : channelIds.delete(channelId);
    settings.store.watchedChannelIds = [...channelIds].join(",");
}

const patchChannelContextMenu: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!channel?.isGuildVocal()) return;

    const watched = getWatchedChannelIds().has(channel.id);
    const group = findGroupChildrenByChildId(["mute-channel", "unmute-channel"], children) ?? children;

    group.push(
        <Menu.MenuCheckboxItem
            id="vc-auto-voice-join-watch"
            label="Auto-join when someone enters"
            checked={watched}
            action={() => {
                setChannelWatched(channel.id, !watched);
                showToast(
                    `${!watched ? "Watching" : "Stopped watching"} ${channel.name}`,
                    Toasts.Type.MESSAGE
                );
            }}
        />
    );
};

export default definePlugin({
    name: "AutoVoiceJoin",
    description: "Automatically joins selected voice channels when another user enters them",
    authors: [{ name: "AxeMa", id: 0n }],
    tags: ["Voice", "Utility"],
    settings,

    contextMenus: {
        "channel-context": patchChannelContextMenu
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceStateChangeEvent[]; }) {
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (!currentUserId) return;
            if (SelectedChannelStore.getVoiceChannelId()) return;

            const watchedChannelIds = getWatchedChannelIds();
            const joinedState = voiceStates.find(state =>
                state.userId !== currentUserId
                && state.channelId !== state.oldChannelId
                && !!state.channelId
                && watchedChannelIds.has(state.channelId)
            );

            if (!joinedState?.channelId) return;

            selectVoiceChannel(joinedState.channelId);

            if (settings.store.showJoinToast) {
                const channelName = ChannelStore.getChannel(joinedState.channelId)?.name ?? "watched voice channel";
                showToast(`Joining ${channelName}`, Toasts.Type.SUCCESS);
            }
        }
    }
});
