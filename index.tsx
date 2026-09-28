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
import { ChannelStore, Menu, SelectedChannelStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

interface VoiceStateChangeEvent {
    userId: string;
    channelId?: string | null;
    oldChannelId?: string | null;
}

const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");
let watchedChannelStyle: HTMLStyleElement | null = null;
let autoLeaveTimer: ReturnType<typeof setTimeout> | undefined;
let running = false;

const settings = definePluginSettings({
    watchedChannelIds: {
        type: OptionType.STRING,
        description: "Voice channel IDs watched by Auto Voice Join (normally managed from channel context menus)",
        default: ""
    },
    autoLeaveChannelIds: {
        type: OptionType.STRING,
        description: "Channels with Auto-leave when alone enabled (managed from channel context menus)",
        default: "",
        onChange: () => scheduleAutoLeave()
    },
    showJoinToast: {
        type: OptionType.BOOLEAN,
        description: "Show a notification when Auto Voice Join connects to a watched channel",
        default: true
    }
});

function getWatchedChannelIds() {
    return new Set(settings.store.watchedChannelIds
        .split(",")
        .map(id => id.trim())
        .filter(id => /^\d+$/.test(id)));
}

function getAutoLeaveChannelIds() {
    return new Set(settings.store.autoLeaveChannelIds.split(",").map(id => id.trim()).filter(id => /^\d+$/.test(id)));
}

function cancelAutoLeave() {
    clearTimeout(autoLeaveTimer);
    autoLeaveTimer = undefined;
}

function scheduleAutoLeave() {
    cancelAutoLeave();
    if (!running) return;

    const channelId = SelectedChannelStore.getVoiceChannelId();
    const userId = UserStore.getCurrentUser()?.id;
    if (!channelId || !userId || !getAutoLeaveChannelIds().has(channelId)) return;

    // Let the current Flux dispatch finish, then check fresh state before leaving.
    autoLeaveTimer = setTimeout(() => {
        autoLeaveTimer = undefined;
        if (!running || UserStore.getCurrentUser()?.id !== userId) return;
        if (SelectedChannelStore.getVoiceChannelId() !== channelId) return;
        if (!getAutoLeaveChannelIds().has(channelId)) return;
        if (!ChannelStore.getChannel(channelId)?.isGuildVocal()) return;

        const occupants = Object.values(VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {});
        // An empty/unloaded store must not be treated as proof that we are alone.
        if (occupants.length !== 1 || occupants[0].userId !== userId || occupants[0].channelId !== channelId) return;

        selectVoiceChannel(null);
    }, 500);
}

function updateWatchedChannelStyle() {
    watchedChannelStyle ??= document.createElement("style");
    watchedChannelStyle.dataset.vencordName = "AutoVoiceJoin";
    watchedChannelStyle.textContent = [...getWatchedChannelIds()]
        .map(channelId => `
            [data-list-item-id="channels___${channelId}"] [class*="name_"] {
                color: var(--green-360) !important;
            }
        `)
        .join("\n");

    if (!watchedChannelStyle.isConnected) document.head.append(watchedChannelStyle);
}

function setChannelWatched(channelId: string, watched: boolean) {
    const channelIds = getWatchedChannelIds();
    watched ? channelIds.add(channelId) : channelIds.delete(channelId);
    settings.store.watchedChannelIds = [...channelIds].join(",");
    updateWatchedChannelStyle();
}

const patchChannelContextMenu: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!channel?.isGuildVocal()) return;

    const watched = getWatchedChannelIds().has(channel.id);
    const autoLeave = getAutoLeaveChannelIds().has(channel.id);
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
        />,
        <Menu.MenuCheckboxItem
            id="vc-auto-voice-join-leave"
            label="Auto-leave when alone"
            checked={autoLeave}
            action={() => {
                const channelIds = getAutoLeaveChannelIds();
                autoLeave ? channelIds.delete(channel.id) : channelIds.add(channel.id);
                settings.store.autoLeaveChannelIds = [...channelIds].join(",");
                scheduleAutoLeave();
                showToast(`${autoLeave ? "Disabled" : "Enabled"} auto-leave for ${channel.name}`, Toasts.Type.MESSAGE);
            }}
        />
    );
};

export default definePlugin({
    name: "AutoVoiceJoin",
    description: "Automatically joins selected voice channels and optionally leaves when you are alone",
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
            const currentChannelId = SelectedChannelStore.getVoiceChannelId();
            if (voiceStates.some(state => state.userId === currentUserId
                || (currentChannelId && (state.channelId === currentChannelId || state.oldChannelId === currentChannelId)))) {
                scheduleAutoLeave();
            }
            if (currentChannelId) return;

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
    },

    start() {
        running = true;
        updateWatchedChannelStyle();
        scheduleAutoLeave();
    },

    stop() {
        running = false;
        cancelAutoLeave();
        watchedChannelStyle?.remove();
        watchedChannelStyle = null;
    }
});

