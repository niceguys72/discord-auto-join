// Run inside a Vencord source checkout: node --test src/userplugins/autoVoiceJoin/tests/autoLeave.cjs
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const code = ts.transpileModule(readFileSync(join(__dirname, "../index.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false, jsx: ts.JsxEmit.React, jsxFactory: "React.createElement" }
}).outputText;

function setup() {
    const state = { channelId: "100", userId: "me", occupants: [{ userId: "me", channelId: "100" }], calls: [] };
    let settings;
    let nextTimer = 0;
    const timers = new Map();
    const channel = { id: "100", name: "Test VC", isGuildVocal: () => true };
    const modules = {
        "@api/ContextMenu": { findGroupChildrenByChildId: () => undefined },
        "@api/Settings": { definePluginSettings(def) {
            settings = { def, store: Object.fromEntries(Object.entries(def).map(([key, value]) => [key, value.default])) };
            return settings;
        } },
        "@utils/types": { default: plugin => plugin, OptionType: { STRING: 1, BOOLEAN: 2 } },
        "@webpack": { findByPropsLazy: () => ({ selectVoiceChannel: id => state.calls.push(id) }) },
        "@webpack/common": {
            ChannelStore: { getChannel: () => channel },
            Menu: { MenuCheckboxItem: "checkbox" },
            SelectedChannelStore: { getVoiceChannelId: () => state.channelId },
            UserStore: { getCurrentUser: () => state.userId ? { id: state.userId } : undefined },
            VoiceStateStore: { getVoiceStatesForChannel: () => state.occupants },
            showToast() {}, Toasts: { Type: { MESSAGE: 0, SUCCESS: 1 } }
        }
    };
    const context = {
        exports: {}, require: name => { assert.ok(modules[name], name); return modules[name]; },
        React: { createElement: (type, props) => ({ type, props }) },
        document: {
            createElement: () => ({ dataset: {}, remove() {} }),
            head: { append() {} }
        },
        setTimeout: (callback, delay) => { assert.equal(delay, 500); timers.set(++nextTimer, callback); return nextTimer; },
        clearTimeout: id => timers.delete(id)
    };
    vm.runInNewContext(code, context);
    const plugin = context.exports.default;
    plugin.start();
    const flush = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); };
    const update = (voiceStates = [{ userId: "me", channelId: state.channelId }]) => plugin.flux.VOICE_STATE_UPDATES({ voiceStates });
    return { state, settings, plugin, channel, flush, update };
}

test("auto-leave is opt-in and independent of the auto-join watchlist", () => {
    const h = setup();
    h.settings.store.watchedChannelIds = "100";
    h.update(); h.flush();
    assert.deepEqual(h.state.calls, []);
    h.settings.store.watchedChannelIds = "";
    h.settings.store.autoLeaveChannelIds = "100";
    h.state.occupants.push({ userId: "friend", channelId: "100" });
    h.update(); h.flush();
    assert.deepEqual(h.state.calls, []);
    // A departure event can reach the plugin before the store finishes updating.
    h.update([{ userId: "friend", oldChannelId: "100", channelId: null }]);
    assert.deepEqual(h.state.calls, []);
    h.state.occupants.pop(); h.flush();
    assert.deepEqual(h.state.calls, [null]);
});

test("stays when any other occupant (including a bot) remains or rejoins", () => {
    const h = setup(); h.settings.store.autoLeaveChannelIds = "100";
    h.update();
    h.state.occupants.push({ userId: "bot", channelId: "100" });
    h.flush();
    assert.deepEqual(h.state.calls, []);
});

for (const [name, change] of Object.entries({
    "switching channels": h => { h.state.channelId = "200"; },
    "disconnecting manually": h => { h.state.channelId = undefined; },
    "changing account": h => { h.state.userId = "other"; },
    "disabling auto-leave": h => { h.settings.store.autoLeaveChannelIds = ""; },
    "disabling the plugin": h => h.plugin.stop(),
    "unloaded voice states": h => { h.state.occupants = undefined; },
    "empty voice states": h => { h.state.occupants = []; },
    "missing self state": h => { h.state.occupants = [{ userId: "friend", channelId: "100" }]; },
    "stale self channel": h => { h.state.occupants[0].channelId = "200"; }
})) {
    test(`does not disconnect after ${name}`, () => {
        const h = setup(); h.settings.store.autoLeaveChannelIds = "100";
        h.update(); change(h); h.flush();
        assert.deepEqual(h.state.calls, []);
    });
}

test("menu toggles persist and enabling while alone schedules a check", () => {
    const h = setup(); const children = [];
    h.plugin.contextMenus["channel-context"](children, { channel: h.channel });
    const leave = children.find(item => item.props.id === "vc-auto-voice-join-leave");
    assert.equal(leave.props.checked, false);
    leave.props.action();
    assert.equal(h.settings.store.autoLeaveChannelIds, "100");
    h.flush(); assert.deepEqual(h.state.calls, [null]);
    const refreshed = [];
    h.plugin.contextMenus["channel-context"](refreshed, { channel: h.channel });
    const enabled = refreshed.find(item => item.props.id === leave.props.id);
    assert.equal(enabled.props.checked, true);
    enabled.props.action();
    assert.equal(h.settings.store.autoLeaveChannelIds, "");
});

test("restart checks saved auto-leave settings; repeated events coalesce", () => {
    const h = setup(); h.plugin.stop(); h.settings.store.autoLeaveChannelIds = "100";
    h.plugin.start(); h.update(); h.update(); h.flush();
    assert.deepEqual(h.state.calls, [null]);
});

test("auto-join still works disconnected and never switches an active call", () => {
    const h = setup(); h.settings.store.watchedChannelIds = "200";
    const arrival = [{ userId: "friend", channelId: "200", oldChannelId: null }];
    h.update(arrival); h.flush(); assert.deepEqual(h.state.calls, []);
    h.state.channelId = undefined;
    h.update(arrival); assert.deepEqual(h.state.calls, ["200"]);
});

test("activity in unrelated channels does not delay a pending disconnect", () => {
    const h = setup(); h.settings.store.autoLeaveChannelIds = "100";
    h.update();
    h.update([{ userId: "someone", channelId: "300", oldChannelId: "200" }]);
    h.flush(); assert.deepEqual(h.state.calls, [null]);
});
