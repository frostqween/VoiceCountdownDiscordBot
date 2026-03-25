const BOT_START_TIME = Date.now();
const MAX_RECENT_ERRORS = 20;
const recentErrors = [];
const guildVoiceEvents = new Map();

function trimStack(stack, maxLines = 6) {
    if (!stack) {
        return null;
    }

    return stack
        .split('\n')
        .slice(0, maxLines)
        .join('\n');
}

function recordError(scope, error, context = {}) {
    recentErrors.unshift({
        timestamp: new Date().toISOString(),
        scope,
        stage: error?.stage ?? null,
        code: error?.code ?? null,
        message: error?.message ?? String(error),
        stack: trimStack(error?.stack),
        context,
    });

    if (recentErrors.length > MAX_RECENT_ERRORS) {
        recentErrors.length = MAX_RECENT_ERRORS;
    }
}

function getRecentErrors(limit = 5) {
    return recentErrors.slice(0, limit);
}

function recordGuildVoiceEvent(guildId, event) {
    guildVoiceEvents.set(guildId, {
        timestamp: new Date().toISOString(),
        ...event,
    });
}

function getGuildVoiceEvent(guildId) {
    return guildVoiceEvents.get(guildId) ?? null;
}

function getBotStartTime() {
    return BOT_START_TIME;
}

module.exports = {
    getBotStartTime,
    getGuildVoiceEvent,
    getRecentErrors,
    recordError,
    recordGuildVoiceEvent,
};
