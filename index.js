const { Client, Collection, GatewayIntentBits, ActivityType } = require('discord.js');
const { generateDependencyReport, getVoiceConnection } = require('@discordjs/voice');
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
    getBotStartTime,
    getGuildVoiceEvent,
    getRecentErrors,
    recordError,
} = require('./utils/debug-store');

const DEBUG_PREFIX = process.env.DEBUG_PREFIX?.trim() || '!debug';
const ENABLE_MESSAGE_DEBUG = ['1', 'true', 'yes', 'on'].includes((process.env.ENABLE_MESSAGE_DEBUG ?? '').trim().toLowerCase());

function getOwnerIds() {
    const rawOwnerIds = [
        process.env.OWNER_ID,
        process.env.OWNER_IDS,
    ]
        .filter(Boolean)
        .flatMap(value => value.split(','))
        .map(value => value.trim())
        .filter(Boolean);

    return new Set(rawOwnerIds);
}

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        ...(ENABLE_MESSAGE_DEBUG ? [GatewayIntentBits.MessageContent] : [])
    ]
});

client.commands = new Collection();

function isDebugAuthorized(message) {
    const ownerIds = getOwnerIds();
    return ownerIds.has(message.author.id);
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours || days) parts.push(`${hours}h`);
    if (minutes || hours || days) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatGatewayPing(ping) {
    if (!Number.isFinite(ping) || ping < 0) {
        return 'not ready yet';
    }

    return `${ping}ms`;
}

function toCodeBlock(text, maxLength = 1800) {
    const safeText = text.length > maxLength ? `${text.slice(0, maxLength - 16)}\n...[truncated]` : text;
    return `\`\`\`txt\n${safeText}\n\`\`\``;
}

function buildDebugStatusReport() {
    const memory = process.memoryUsage();
    const lines = [
        `User: ${client.user?.tag ?? 'unknown'}`,
        `Uptime: ${formatDuration(Date.now() - getBotStartTime())}`,
        `Gateway Ping: ${formatGatewayPing(client.ws.ping)}`,
        `Guilds: ${client.guilds.cache.size}`,
        `Commands: ${client.commands?.size ?? 0}`,
        `Node: ${process.version}`,
        `Platform: ${process.platform} ${process.arch}`,
        `Memory RSS: ${formatBytes(memory.rss)}`,
        `Heap Used: ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}`,
        `Owner Lock: ${getOwnerIds().size > 0 ? `${getOwnerIds().size} owner id(s)` : 'not configured'}`,
        `Debug Prefix: ${DEBUG_PREFIX}`,
    ];

    return toCodeBlock(lines.join('\n'));
}

function buildDebugVoiceReport(message) {
    const guildId = message.guildId;
    const connection = guildId ? getVoiceConnection(guildId) : null;
    const voiceEvent = guildId ? getGuildVoiceEvent(guildId) : null;
    const memberChannel = message.member?.voice?.channel ?? null;

    const lines = [
        `Guild: ${message.guild?.name ?? 'unknown'} (${guildId ?? 'n/a'})`,
        `Your VC: ${memberChannel ? `${memberChannel.name} (${memberChannel.id})` : 'not in voice'}`,
        `Connection: ${connection ? connection.state.status : 'none'}`,
    ];

    if (connection) {
        lines.push(`Configured Channel: ${connection.joinConfig.channelId ?? 'n/a'}`);
        lines.push(`Self Deaf: ${String(connection.joinConfig.selfDeaf)}`);
        lines.push(`Self Mute: ${String(connection.joinConfig.selfMute)}`);
        lines.push(`Subscription: ${connection.state.subscription ? 'present' : 'none'}`);
    }

    if (voiceEvent) {
        lines.push(`Last Voice Event: ${voiceEvent.type} @ ${voiceEvent.timestamp}`);

        if (voiceEvent.channelId) {
            lines.push(`Last Channel ID: ${voiceEvent.channelId}`);
        }

        if (voiceEvent.duration) {
            lines.push(`Last Duration: ${voiceEvent.duration}s`);
        }

        if (voiceEvent.stage) {
            lines.push(`Last Stage: ${voiceEvent.stage}`);
        }

        if (voiceEvent.message) {
            lines.push(`Last Message: ${voiceEvent.message}`);
        }
    }

    return toCodeBlock(lines.join('\n'));
}

function buildDebugErrorReport() {
    const errors = getRecentErrors(5);

    if (errors.length === 0) {
        return toCodeBlock('No recent runtime errors recorded.');
    }

    const lines = [];
    for (const error of errors) {
        lines.push(`[${error.timestamp}] ${error.scope}`);
        lines.push(`message=${error.message}`);

        if (error.stage) {
            lines.push(`stage=${error.stage}`);
        }

        if (error.code) {
            lines.push(`code=${error.code}`);
        }

        if (error.context?.guildId) {
            lines.push(`guild=${error.context.guildId}`);
        }

        if (error.context?.channelId) {
            lines.push(`channel=${error.context.channelId}`);
        }

        if (error.context?.duration) {
            lines.push(`duration=${error.context.duration}`);
        }

        if (error.stack) {
            lines.push(error.stack);
        }

        lines.push('');
    }

    return toCodeBlock(lines.join('\n'));
}

async function handleDebugMessage(message) {
    if (!isDebugAuthorized(message)) {
        return;
    }

    const parts = message.content.trim().split(/\s+/);
    const subcommand = parts[1]?.toLowerCase() ?? 'help';

    if (subcommand === 'status') {
        await message.reply(buildDebugStatusReport());
        return;
    }

    if (subcommand === 'voice') {
        await message.reply(buildDebugVoiceReport(message));
        return;
    }

    if (subcommand === 'errors') {
        await message.reply(buildDebugErrorReport());
        return;
    }

    if (subcommand === 'deps') {
        await message.reply(toCodeBlock(generateDependencyReport()));
        return;
    }

    await message.reply(toCodeBlock([
        `Usage: ${DEBUG_PREFIX} <status|voice|errors|deps>`,
        'Examples:',
        `  ${DEBUG_PREFIX} status`,
        `  ${DEBUG_PREFIX} voice`,
    ].join('\n')));
}

// Load commands from the commands directory
const foldersPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(foldersPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// When the client is ready, run this code (only once)
client.once('clientReady', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    console.log(generateDependencyReport());
    console.log(`Message debug commands: ${ENABLE_MESSAGE_DEBUG ? `enabled (${DEBUG_PREFIX})` : 'disabled'}`);
    
    // Set the bot's activity status
    client.user.setActivity('Anime', { type: ActivityType.Watching });
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        recordError('interaction.execute', error, {
            commandName: interaction.commandName,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            userId: interaction.user?.id,
        });
        
        const errorMessage = {
            content: 'There was an error while executing this command!',
            ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

client.on('messageCreate', async message => {
    if (!ENABLE_MESSAGE_DEBUG) return;
    if (message.author.bot) return;
    if (!message.content.startsWith(DEBUG_PREFIX)) return;

    try {
        await handleDebugMessage(message);
    } catch (error) {
        console.error('Error executing debug message command:', error);
        recordError('message.debug', error, {
            guildId: message.guildId,
            channelId: message.channelId,
            userId: message.author.id,
            content: message.content,
        });
        await message.reply('There was an error while executing the debug message command.');
    }
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
