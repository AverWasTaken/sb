import { Message, EmbedBuilder } from 'discord.js';
import { reply } from './utils';

export function help(message: Message) {
    const helpEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Bot Commands')
        .setDescription('Here is a list of all available commands:')
        .addFields(
            { name: 'Fun & Games', value: '`!slots <amount>`\n`!coinflip <amount> <heads/tails>`\n`!blackjack <amount>`' },
            { name: 'Blackjack', value: 'Use the buttons on the game message'},
            { name: 'Farming', value: '`!farm`\n`!inventory`\n`!balance` / `!bal`' },
            { name: 'PvP', value: '`!rob @user` / `!steal @user`' },
            { name: 'Banking', value: '`!loan <amount>`\n`!repay`\n`!debt`\n`!pay @user <amount>`' },
            { name: 'Credit', value: '`!gambo` - View GAMBO Score v3' },
            { name: 'General', value: '`!ping`\n`!help`' }
        )
        .setTimestamp()
        .setFooter({ text: 'Farm Bot' });

    reply(message.channel, helpEmbed);
} 