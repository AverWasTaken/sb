import 'dotenv/config';
import { Client, GatewayIntentBits, Events, Message } from 'discord.js';
import { openDb } from './database';
import { Database } from 'sqlite';
import * as farmCommands from './farm';
import * as gameCommands from './games';
import * as helpCommand from './help';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const prefix = '!';
let db: Database;

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  if ('send' in message.channel && typeof message.channel.send === 'function') {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    if (commandName === 'ping') {
      message.channel.send('Pong!');
    } else if (commandName === 'inventory') {
        farmCommands.inventory(message, db);
    } else if (commandName === 'balance' || commandName === 'bal') {
        farmCommands.balance(message, db);
    } else if (commandName === 'farm') {
        farmCommands.farm(message, db);
    } else if (commandName === 'rob' || commandName === 'steal') {
        farmCommands.rob(message, db, args);
    } else if (commandName === 'gambo') {
        farmCommands.gambo(message, db);
    } else if (commandName === 'loan') {
        farmCommands.loan(message, db, args);
    } else if (commandName === 'repay') {
        farmCommands.repay(message, db);
    } else if (commandName === 'pay') {
        farmCommands.pay(message, db, args);
    } else if (commandName === 'debt') {
        farmCommands.debt(message, db);
    } else if (commandName === 'reset') {
        farmCommands.reset(message, db);
    } else if (commandName === 'slots') {
        gameCommands.slots(message, db, args);
    } else if (commandName === 'coinflip') {
        gameCommands.coinflip(message, db, args);
    } else if (commandName === 'blackjack') {
        gameCommands.blackjack(message, db, args);
    } else if (commandName === 'hit') {
        gameCommands.hit(message, db);
    } else if (commandName === 'stand') {
        gameCommands.stand(message, db);
    } else if (commandName === 'help') {
        helpCommand.help(message);
    }
  }
});


async function main() {
    db = await openDb();
    // You can use the db object here if needed for setup

    client.login(process.env.TOKEN);
}

main(); 