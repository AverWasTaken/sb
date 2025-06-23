import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Database } from 'sqlite';
import { reply } from './utils';

// Import GAMBO score tracking from farm.ts
async function updateGamboScoreForBet(db: Database, userId: string, betAmount: number, winAmount: number) {
    // Ensure gambo score record exists
    let score = await db.get('SELECT * FROM gambo_scores WHERE user_id = ?', userId);
    if (!score) {
        await db.run('INSERT INTO gambo_scores (user_id) VALUES (?)', userId);
    }
    
    const isWin = winAmount > betAmount;
    const profit = winAmount - betAmount;
    
    await db.run(`
        UPDATE gambo_scores 
        SET total_bets = total_bets + 1,
            total_winnings = total_winnings + ?,
            total_losses = total_losses + ?,
            last_updated = ?
        WHERE user_id = ?
    `, isWin ? profit : 0, isWin ? 0 : betAmount, Date.now(), userId);
}

async function getCotton(db: Database, userId: string): Promise<number> {
    const row = await db.get('SELECT quantity FROM inventory WHERE user_id = ? AND item = ?', userId, 'cotton');
    return row?.quantity ?? 0;
}

async function updateCotton(db: Database, userId: string, amount: number, action: 'add' | 'remove' | 'set') {
    const currentCotton = await getCotton(db, userId);
    let newAmount = 0;
    switch (action) {
        case 'add':
            newAmount = currentCotton + amount;
            break;
        case 'remove':
            newAmount = currentCotton - amount;
            break;
        case 'set':
            newAmount = amount;
            break;
    }

    if (newAmount < 0) newAmount = 0;

    const userInventory = await db.get('SELECT * FROM inventory WHERE user_id = ? AND item = ?', userId, 'cotton');
    if (userInventory) {
        await db.run('UPDATE inventory SET quantity = ? WHERE user_id = ? AND item = ?', newAmount, userId, 'cotton');
    } else {
        await db.run('INSERT INTO inventory (user_id, item, quantity) VALUES (?, ?, ?)', userId, 'cotton', newAmount);
    }
}

export async function slots(message: Message, db: Database, args: string[]) {
    const bet = parseInt(args[0]);

    if (isNaN(bet) || bet <= 0) {
        reply(message.channel, 'Please provide a valid amount of cotton to bet. Usage: !slots <amount>');
        return;
    }

    const userCotton = await getCotton(db, message.author.id);

    if (userCotton < bet) {
        reply(message.channel, 'You do not have enough cotton to place that bet.');
        return;
    }

    const reels = ['🍒', '🍋', '🍊', '🍉', '🍇', '⭐'];
    const reel1 = reels[Math.floor(Math.random() * reels.length)];
    const reel2 = reels[Math.floor(Math.random() * reels.length)];
    const reel3 = reels[Math.floor(Math.random() * reels.length)];

    const result = `${reel1} | ${reel2} | ${reel3}`;
    let winAmount = 0;

    if (reel1 === reel2 && reel2 === reel3) {
        winAmount = bet * 10; // Jackpot
    } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
        winAmount = bet * 2; // Two of a kind
    }

    if (winAmount > 0) {
        await updateCotton(db, message.author.id, winAmount - bet, 'add');
        await updateGamboScoreForBet(db, message.author.id, bet, winAmount);
        reply(message.channel, `${result}\nYou won ${winAmount} cotton!`);
    } else {
        await updateCotton(db, message.author.id, bet, 'remove');
        await updateGamboScoreForBet(db, message.author.id, bet, 0);
        reply(message.channel, `${result}\nYou lost ${bet} cotton. Better luck next time!`);
    }
}

export async function coinflip(message: Message, db: Database, args: string[]) {
    if (!args[0] || !args[1]) {
        reply(message.channel, 'Usage: !coinflip <amount> <heads/tails>\nExample: !coinflip 50 heads');
        return;
    }

    const bet = parseInt(args[0]);
    const choice = args[1].toLowerCase();

    if (isNaN(bet) || bet <= 0) {
        reply(message.channel, 'Please provide a valid amount of cotton to bet.');
        return;
    }

    if (choice !== 'heads' && choice !== 'tails' && choice !== 'h' && choice !== 't') {
        reply(message.channel, 'Please choose "heads" or "tails" (or "h"/"t").');
        return;
    }

    const userCotton = await getCotton(db, message.author.id);

    if (userCotton < bet) {
        reply(message.channel, 'You do not have enough cotton to place that bet.');
        return;
    }

    // Normalize choice
    const playerChoice = (choice === 'heads' || choice === 'h') ? 'heads' : 'tails';
    
    // Flip the coin
    const coinResult = Math.random() < 0.5 ? 'heads' : 'tails';
    const win = playerChoice === coinResult;
    
    const coinEmoji = coinResult === 'heads' ? '🪙' : '🥈';

    if (win) {
        await updateCotton(db, message.author.id, bet, 'add');
        await updateGamboScoreForBet(db, message.author.id, bet, bet * 2);
        reply(message.channel, `${coinEmoji} **${coinResult.toUpperCase()}!** You called it right and won ${bet} cotton!`);
    } else {
        await updateCotton(db, message.author.id, bet, 'remove');
        await updateGamboScoreForBet(db, message.author.id, bet, 0);
        reply(message.channel, `${coinEmoji} **${coinResult.toUpperCase()}!** You called ${playerChoice} and lost ${bet} cotton.`);
    }
}

// Blackjack specific code
const suits = ['♠', '♥', '♦', '♣'];
const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

interface Card {
    suit: string;
    value: string;
}

function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of suits) {
        for (const value of values) {
            deck.push({ suit, value });
        }
    }
    return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function getCardValue(card: Card): number {
    if (['J', 'Q', 'K'].includes(card.value)) {
        return 10;
    }
    if (card.value === 'A') {
        return 11; // We will handle the 1 or 11 logic in the hand calculation
    }
    return parseInt(card.value);
}

function getHandValue(hand: Card[]): number {
    let value = hand.reduce((sum, card) => sum + getCardValue(card), 0);
    let aces = hand.filter(card => card.value === 'A').length;

    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }

    return value;
}

const activeBlackjackGames = new Map<string, any>();

export async function blackjack(message: Message, db: Database, args: string[]) {
    const bet = parseInt(args[0]);

    if (isNaN(bet) || bet <= 0) {
        reply(message.channel, 'Please provide a valid amount of cotton to bet. Usage: !blackjack <amount>');
        return;
    }

    if (activeBlackjackGames.has(message.author.id)) {
        reply(message.channel, 'You already have an active blackjack game!');
        return;
    }

    const userCotton = await getCotton(db, message.author.id);
    if (userCotton < bet) {
        reply(message.channel, 'You do not have enough cotton to place that bet.');
        return;
    }

    const deck = shuffleDeck(createDeck());
    const playerHand: Card[] = [deck.pop()!, deck.pop()!];
    const dealerHand: Card[] = [deck.pop()!, deck.pop()!];

    activeBlackjackGames.set(message.author.id, {
        bet,
        deck,
        playerHand,
        dealerHand,
        messageId: null,
    });

    const handToString = (hand: Card[]) => hand.map(c => `${c.value}${c.suit}`).join(' ');

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🃏 Blackjack Game')
        .setDescription(`**Bet:** ${bet} cotton`)
        .addFields(
            { name: '🎯 Your Hand', value: `${handToString(playerHand)}\n**Value:** ${getHandValue(playerHand)}`, inline: true },
            { name: '🎰 Dealer Hand', value: `${handToString([dealerHand[0]])} 🂠\n**Value:** ${getCardValue(dealerHand[0])} + ?`, inline: true }
        )
        .setFooter({ text: `${message.author.username}'s Blackjack Game` });

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`hit_${message.author.id}`)
                .setLabel('Hit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎯'),
            new ButtonBuilder()
                .setCustomId(`stand_${message.author.id}`)
                .setLabel('Stand')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✋')
        );

    if ('send' in message.channel && typeof message.channel.send === 'function') {
        const gameMessage = await message.channel.send({ embeds: [embed], components: [row] });
        activeBlackjackGames.get(message.author.id)!.messageId = gameMessage.id;

        // Create collector for button interactions
        const collector = gameMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                await interaction.reply({ content: 'This is not your game!', flags: 64 });
                return;
            }

            const game = activeBlackjackGames.get(message.author.id);
            if (!game) {
                await interaction.reply({ content: 'Game not found!', flags: 64 });
                return;
            }

            if (interaction.customId === `hit_${message.author.id}`) {
                await handleHit(interaction, db, game);
            } else if (interaction.customId === `stand_${message.author.id}`) {
                await handleStand(interaction, db, game);
            }
        });

        collector.on('end', () => {
            activeBlackjackGames.delete(message.author.id);
        });
    }
}

async function handleHit(interaction: any, db: Database, game: any) {
    game.playerHand.push(game.deck.pop()!);
    const playerValue = getHandValue(game.playerHand);
    const handToString = (hand: Card[]) => hand.map(c => `${c.value}${c.suit}`).join(' ');

    if (playerValue > 21) {
        await updateCotton(db, interaction.user.id, game.bet, 'remove');
        await updateGamboScoreForBet(db, interaction.user.id, game.bet, 0);
        
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🃏 Blackjack Game - BUST!')
            .setDescription(`**Bet:** ${game.bet} cotton`)
            .addFields(
                { name: '🎯 Your Hand', value: `${handToString(game.playerHand)}\n**Value:** ${playerValue}`, inline: true },
                { name: '🎰 Dealer Hand', value: `${handToString([game.dealerHand[0]])} 🂠\n**Value:** ${getCardValue(game.dealerHand[0])} + ?`, inline: true },
                { name: '💸 Result', value: `**BUST!** You lost ${game.bet} cotton.`, inline: false }
            )
            .setFooter({ text: `${interaction.user.username}'s Blackjack Game` });

        await interaction.update({ embeds: [embed], components: [] });
        activeBlackjackGames.delete(interaction.user.id);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🃏 Blackjack Game')
        .setDescription(`**Bet:** ${game.bet} cotton`)
        .addFields(
            { name: '🎯 Your Hand', value: `${handToString(game.playerHand)}\n**Value:** ${playerValue}`, inline: true },
            { name: '🎰 Dealer Hand', value: `${handToString([game.dealerHand[0]])} 🂠\n**Value:** ${getCardValue(game.dealerHand[0])} + ?`, inline: true }
        )
        .setFooter({ text: `${interaction.user.username}'s Blackjack Game` });

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`hit_${interaction.user.id}`)
                .setLabel('Hit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎯'),
            new ButtonBuilder()
                .setCustomId(`stand_${interaction.user.id}`)
                .setLabel('Stand')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✋')
        );

    await interaction.update({ embeds: [embed], components: [row] });
}

export async function hit(message: Message, db: Database) {
    reply(message.channel, 'Please use the buttons on the blackjack game message instead of commands.');
}

async function handleStand(interaction: any, db: Database, game: any) {
    const handToString = (hand: Card[]) => hand.map(c => `${c.value}${c.suit}`).join(' ');
    let playerValue = getHandValue(game.playerHand);
    let dealerValue = getHandValue(game.dealerHand);

    while (dealerValue < 17) {
        game.dealerHand.push(game.deck.pop()!);
        dealerValue = getHandValue(game.dealerHand);
    }

    let resultText = '';
    let embedColor = 0xffff00; // Yellow for push

    if (dealerValue > 21 || playerValue > dealerValue) {
        await updateCotton(db, interaction.user.id, game.bet, 'add');
        await updateGamboScoreForBet(db, interaction.user.id, game.bet, game.bet * 2);
        resultText = `🎉 **YOU WIN!** You won ${game.bet} cotton.`;
        embedColor = 0x00ff00; // Green for win
    } else if (playerValue < dealerValue) {
        await updateCotton(db, interaction.user.id, game.bet, 'remove');
        await updateGamboScoreForBet(db, interaction.user.id, game.bet, 0);
        resultText = `😔 **YOU LOSE!** You lost ${game.bet} cotton.`;
        embedColor = 0xff0000; // Red for loss
    } else {
        await updateGamboScoreForBet(db, interaction.user.id, game.bet, game.bet);
        resultText = `🤝 **PUSH!** Your bet has been returned.`;
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle('🃏 Blackjack Game - Final Result')
        .setDescription(`**Bet:** ${game.bet} cotton`)
        .addFields(
            { name: '🎯 Your Hand', value: `${handToString(game.playerHand)}\n**Value:** ${playerValue}`, inline: true },
            { name: '🎰 Dealer Hand', value: `${handToString(game.dealerHand)}\n**Value:** ${dealerValue}`, inline: true },
            { name: '🏆 Result', value: resultText, inline: false }
        )
        .setFooter({ text: `${interaction.user.username}'s Blackjack Game` });

    await interaction.update({ embeds: [embed], components: [] });
    activeBlackjackGames.delete(interaction.user.id);
}

export async function stand(message: Message, db: Database) {
    reply(message.channel, 'Please use the buttons on the blackjack game message instead of commands.');
} 