import { Message, EmbedBuilder } from 'discord.js';

export function reply(channel: Message['channel'], content: string | EmbedBuilder) {
    if ('send' in channel && typeof channel.send === 'function') {
        if (typeof content === 'string') {
            channel.send(content);
        } else {
            channel.send({ embeds: [content] });
        }
    }
} 