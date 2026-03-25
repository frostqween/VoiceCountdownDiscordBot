const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    NoSubscriberBehavior,
    StreamType,
    entersState,
    getVoiceConnection,
} = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');

const VOICE_READY_TIMEOUT_MS = 15_000;
const CONNECTION_LISTENERS_ATTACHED = Symbol('connectionListenersAttached');

async function ensureReadyConnection(voiceChannel) {
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
    });

    if (!connection[CONNECTION_LISTENERS_ATTACHED]) {
        connection.on('error', (error) => {
            console.error(`Voice connection error in guild ${voiceChannel.guild.id}:`, error);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                connection.destroy();
            }
        });

        connection[CONNECTION_LISTENERS_ATTACHED] = true;
    }

    await entersState(connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
    return connection;
}

function hasVoicePermissions(voiceChannel, clientUser) {
    const permissions = voiceChannel.permissionsFor(clientUser);
    return Boolean(
        permissions?.has(PermissionFlagsBits.Connect) &&
        permissions.has(PermissionFlagsBits.Speak)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('muffin')
        .setDescription('Muffin bot commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('cd')
                .setDescription('Start a countdown with audio in the voice channel')
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('Select countdown duration')
                        .setRequired(true)
                        .addChoices(
                            { name: '10 seconds', value: '10' },
                            { name: '20 seconds', value: '20' },
                            { name: '30 seconds', value: '30' },
                            { name: '40 seconds', value: '40' },
                            { name: '50 seconds', value: '50' },
                            { name: '60 seconds', value: '60' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join your voice channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave the voice channel')
        ),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'cd') {
            return await this.handleCountdown(interaction);
        } else if (subcommand === 'join') {
            return await this.handleJoin(interaction);
        } else if (subcommand === 'leave') {
            return await this.handleLeave(interaction);
        }
    },

    async handleCountdown(interaction) {
        const countdownDuration = interaction.options.getString('duration');
        
        // Check if user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await interaction.reply({
                content: 'You need to be in a voice channel to use this command!',
                ephemeral: true
            });
        }

        // Check bot permissions
        if (!hasVoicePermissions(voiceChannel, interaction.client.user)) {
            return await interaction.reply({
                content: 'I need permission to connect and speak in your voice channel!',
                ephemeral: true
            });
        }

        const audioPath = path.join(__dirname, '..', 'countdown_audio', `${countdownDuration}SecondHaloCD.mp4`);
        
        // Check if audio file exists
        if (!fs.existsSync(audioPath)) {
            return await interaction.reply({
                content: `${countdownDuration}SecondHaloCD.mp4 audio file not found!`,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const connection = await ensureReadyConnection(voiceChannel);

            // Create audio player with improved settings
            const player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Pause,
                    maxMissedFrames: Math.round(5000 / 20) // 5 seconds of missed frames
                }
            });
            connection.subscribe(player);

            // Create audio resource - no seeking needed since each file is complete
            const resource = createAudioResource(audioPath, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true,
                metadata: { title: `${countdownDuration} second countdown` }
            });

            // Add error handling for the player
            player.on('error', (error) => {
                console.error('Audio player error:', error);
            });

            player.play(resource);
            await entersState(player, AudioPlayerStatus.Playing, 5_000);

            // Handle when audio finishes
            player.once(AudioPlayerStatus.Idle, () => {
                // Don't automatically disconnect - let user use /leave command
                console.log('Countdown finished');
            });

            await interaction.editReply(`Starting ${countdownDuration} second countdown!`);

        } catch (error) {
            console.error('Error in countdown command:', error);

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('There was an error starting the countdown. Check the bot logs for the voice/DAVE dependency report.');
            } else {
                await interaction.reply({
                    content: 'There was an error starting the countdown!',
                    ephemeral: true
                });
            }
        }
    },

    async handleJoin(interaction) {
        // Check if user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await interaction.reply({
                content: 'You need to be in a voice channel for me to join!',
                ephemeral: true
            });
        }

        // Check bot permissions
        if (!hasVoicePermissions(voiceChannel, interaction.client.user)) {
            return await interaction.reply({
                content: 'I need permission to connect and speak in your voice channel!',
                ephemeral: true
            });
        }

        try {
            await interaction.deferReply();
            await ensureReadyConnection(voiceChannel);
            await interaction.editReply(`Joined **${voiceChannel.name}** and completed the voice handshake.`);

        } catch (error) {
            console.error('Error joining voice channel:', error);

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('There was an error joining the voice channel. Check the bot logs for the voice/DAVE dependency report.');
            } else {
                await interaction.reply({
                    content: 'There was an error joining the voice channel!',
                    ephemeral: true
                });
            }
        }
    },

    async handleLeave(interaction) {
        try {
            // Get existing voice connection
            const connection = getVoiceConnection(interaction.guild.id);
            
            if (!connection) {
                return await interaction.reply({
                    content: "I'm not currently in a voice channel!",
                    ephemeral: true
                });
            }

            // Destroy the connection
            connection.destroy();

            await interaction.reply('👋 Left the voice channel!');

        } catch (error) {
            console.error('Error leaving voice channel:', error);
            await interaction.reply({
                content: 'There was an error leaving the voice channel!',
                ephemeral: true
            });
        }
    },
};
