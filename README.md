# Simple VC Countdown Discord Bot

A Discord bot that plays audio countdown sequences in voice channels using Master Chief voice files.

## Features

- `/countdown` slash command with number input (5-60)
- Plays audio files sequentially in voice channels
- Guild-specific commands for faster deployment
- Modular command structure

## Setup

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Configure Environment Variables**

   Edit the `.env` file with your bot credentials:

   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   GUILD_ID=your_guild_id_here
   ```

3. **Deploy Commands**

   ```bash
   npm run deploy
   ```

4. **Start the Bot**
   ```bash
   npm start
   ```

## Bot Permissions

The bot requires the following permissions:

- `Send Messages`
- `Use Slash Commands`
- `Connect` (to voice channels)
- `Speak` (in voice channels)

## Audio Files

Audio files should be placed in the `countdown_audio/` directory and named as `{number}.mp4` (e.g., `5.mp4`, `6.mp4`, etc.).

## Commands

### `/countdown`

Starts an audio countdown in your current voice channel.

**Parameters:**

- `number` (required): The number to count down from (5-60)

**Usage:**

```
/countdown number:10
```

## Project Structure

```
├── commands/
│   └── countdown.js
├── countdown_audio/
│   ├── 5.mp4
│   ├── 6.mp4
│   └── ...
├── .env
├── index.js
├── deploy-commands.js
├── package.json
└── README.md
```

## Development

The bot uses a modular command structure where each command is a separate file in the `commands/` directory. This makes it easy to add new commands by creating new command files.

## License

MIT License - see LICENSE file for details.
