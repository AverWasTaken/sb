import { Message } from 'discord.js';
import { Database } from 'sqlite';
import { reply } from './utils';

async function ensureUser(db: Database, userId: string) {
    let user = await db.get('SELECT * FROM users WHERE id = ?', userId);
    if (!user) {
        await db.run('INSERT INTO users (id) VALUES (?)', userId);
        user = await db.get('SELECT * FROM users WHERE id = ?', userId);
    }
    return user;
}

export async function inventory(message: Message, db: Database) {
    const inventory = await db.all('SELECT * FROM inventory WHERE user_id = ?', message.author.id);
    if (inventory.length === 0) {
        reply(message.channel, `${message.author.username}, your inventory is empty.`);
        return;
    }
    const inventoryList = inventory.map(i => `${i.item}: ${i.quantity}`).join('\n');
    reply(message.channel, `${message.author.username}'s inventory:\n${inventoryList}`);
}

export async function balance(message: Message, db: Database) {
    const cottonInventory = await db.get('SELECT quantity FROM inventory WHERE user_id = ? AND item = ?', message.author.id, 'cotton');
    const cottonAmount = cottonInventory?.quantity || 0;
    reply(message.channel, `${message.author.username}, you have **${cottonAmount}** cotton.`);
}

export async function farm(message: Message, db: Database) {
    const user = await ensureUser(db, message.author.id);
    const now = Date.now();
    const cooldown = 20 * 1000; // 20 seconds

    if (now - user.last_farmed < cooldown) {
        const timeLeft = Math.ceil((cooldown - (now - user.last_farmed)) / 1000 / 60);
        reply(message.channel, `You need to wait ${timeLeft} more minutes before farming again.`);
        return;
    }

    const farmedAmount = Math.floor(Math.random() * 5) + 1; // 1 to 5 cotton

    const userInventory = await db.get('SELECT * FROM inventory WHERE user_id = ? AND item = ?', message.author.id, 'cotton');

    if (userInventory) {
        await db.run('UPDATE inventory SET quantity = quantity + ? WHERE user_id = ? AND item = ?', farmedAmount, message.author.id, 'cotton');
    } else {
        await db.run('INSERT INTO inventory (user_id, item, quantity) VALUES (?, ?, ?)', message.author.id, 'cotton', farmedAmount);
    }

    await db.run('UPDATE users SET last_farmed = ? WHERE id = ?', now, message.author.id);

    reply(message.channel, `You farmed and got ${farmedAmount} cotton!`);
}

export async function gamble(message: Message, db: Database) {
    const userInventory = await db.get('SELECT * FROM inventory WHERE user_id = ? AND item = ?', message.author.id, 'cotton');

    if (!userInventory || userInventory.quantity <= 0) {
        reply(message.channel, 'You have no cotton to gamble!');
        return;
    }

    const quantity = userInventory.quantity;
    const win = Math.random() < 0.5;

    if (win) {
        await db.run('UPDATE inventory SET quantity = quantity * 2 WHERE user_id = ? AND item = ?', message.author.id, 'cotton');
        reply(message.channel, `You won! You now have ${quantity * 2} cotton.`);
    } else {
        await db.run('UPDATE inventory SET quantity = 0 WHERE user_id = ? AND item = ?', message.author.id, 'cotton');
        reply(message.channel, `You lost! You now have 0 cotton.`);
    }
}

export async function rob(message: Message, db: Database, args: string[]) {
    if (!args[0]) {
        reply(message.channel, 'You need to mention someone to rob! Usage: !rob @user');
        return;
    }

    // Extract user ID from mention
    const mentionedUserId = args[0].replace(/[<@!>]/g, '');
    
    if (mentionedUserId === message.author.id) {
        reply(message.channel, 'You cannot rob yourself!');
        return;
    }

    // Check if robber has any cotton
    const robberInventory = await db.get('SELECT quantity FROM inventory WHERE user_id = ? AND item = ?', message.author.id, 'cotton');
    const robberCotton = robberInventory?.quantity || 0;

    if (robberCotton < 5) {
        reply(message.channel, 'You need at least 5 cotton to attempt a robbery (risk money)!');
        return;
    }

    // Check if target has cotton
    const targetInventory = await db.get('SELECT quantity FROM inventory WHERE user_id = ? AND item = ?', mentionedUserId, 'cotton');
    const targetCotton = targetInventory?.quantity || 0;

    if (targetCotton < 10) {
        reply(message.channel, 'That person doesn\'t have enough cotton to make it worth robbing (needs at least 10)!');
        return;
    }

    // 70% chance of success, 30% chance of getting caught
    const success = Math.random() < 0.7;
    
    if (success) {
        // Successful robbery - steal 20-50% of their cotton
        const stealPercentage = Math.random() * 0.3 + 0.2; // 20% to 50%
        const stolenAmount = Math.floor(targetCotton * stealPercentage);
        
        // Transfer cotton
        await db.run('UPDATE inventory SET quantity = quantity - ? WHERE user_id = ? AND item = ?', stolenAmount, mentionedUserId, 'cotton');
        
        const robberCurrentInventory = await db.get('SELECT * FROM inventory WHERE user_id = ? AND item = ?', message.author.id, 'cotton');
        if (robberCurrentInventory) {
            await db.run('UPDATE inventory SET quantity = quantity + ? WHERE user_id = ? AND item = ?', stolenAmount, message.author.id, 'cotton');
        } else {
            await db.run('INSERT INTO inventory (user_id, item, quantity) VALUES (?, ?, ?)', message.author.id, 'cotton', stolenAmount);
        }

        reply(message.channel, `🦹 **ROBBERY SUCCESSFUL!** You stole ${stolenAmount} cotton from <@${mentionedUserId}>! They didn't see it coming...`);
    } else {
        // Got caught - lose some of your own cotton as a penalty
        const penalty = Math.floor(robberCotton * 0.3); // Lose 30% of your cotton
        await db.run('UPDATE inventory SET quantity = quantity - ? WHERE user_id = ? AND item = ?', penalty, message.author.id, 'cotton');
        
        reply(message.channel, `🚨 **YOU GOT CAUGHT!** <@${mentionedUserId}> caught you trying to rob them! You lost ${penalty} cotton as a penalty and your reputation is ruined...`);
    }
}

// GAMBO Score and Banking System

async function ensureGamboScore(db: Database, userId: string) {
    let score = await db.get('SELECT * FROM gambo_scores WHERE user_id = ?', userId);
    if (!score) {
        await db.run('INSERT INTO gambo_scores (user_id) VALUES (?)', userId);
        score = await db.get('SELECT * FROM gambo_scores WHERE user_id = ?', userId);
    }
    return score;
}

async function updateGamboScore(db: Database, userId: string, betAmount: number, winAmount: number) {
    await ensureGamboScore(db, userId);
    
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
    
    // Recalculate GAMBO score
    await recalculateGamboScore(db, userId);
}

async function recalculateGamboScore(db: Database, userId: string) {
    const stats = await db.get('SELECT * FROM gambo_scores WHERE user_id = ?', userId);
    if (!stats) return;
    
    let score = 500; // Base score
    
    // Require minimum activity before good scores (like real credit)
    if (stats.total_bets < 10) {
        score = Math.min(score, 550); // Cap at 550 for new players
    }
    
    // Win/Loss ratio (25% of score) - reduced impact
    if (stats.total_bets >= 5) {
        const totalAmount = stats.total_winnings + stats.total_losses;
        const winRate = totalAmount > 0 ? stats.total_winnings / totalAmount : 0;
        // More conservative scoring - don't reward lucky streaks too much
        score += Math.floor((winRate - 0.45) * 150); // Reduced from 400 to 150
    }
    
    // Loan repayment history (40% of score) - more important like real credit
    const totalLoans = stats.loans_repaid + stats.loans_defaulted;
    if (totalLoans > 0) {
        const repaymentRate = stats.loans_repaid / totalLoans;
        score += Math.floor((repaymentRate - 0.8) * 200); // Need 80%+ repayment for bonus
        
        // Heavy penalty for defaults
        if (stats.loans_defaulted > 0) {
            score -= stats.loans_defaulted * 75; // -75 per default
        }
    }
    
    // Experience and consistency (25% of score)
    const experienceBonus = Math.min(stats.total_bets * 1, 100); // Reduced from 200 to 100
    score += experienceBonus;
    
    // Stability bonus - reward consistent play over time (10% of score)
    const daysSinceActive = (Date.now() - stats.last_updated) / (1000 * 60 * 60 * 24);
    if (daysSinceActive < 1) {
        score += 20; // Recent activity
    } else if (daysSinceActive < 7) {
        score += Math.floor((8 - daysSinceActive) * 2);
    }
    
    // Volume penalty for gambling too much (addiction indicator)
    if (stats.total_bets > 100) {
        const excessBets = stats.total_bets - 100;
        score -= Math.floor(excessBets / 10); // -1 per 10 excess bets
    }
    
    // Net loss penalty (like real credit utilization)
    const netProfit = stats.total_winnings - stats.total_losses;
    if (netProfit < -100) {
        score -= Math.floor(Math.abs(netProfit) / 20); // Penalty for big losses
    }
    
    // Clamp score between 300 and 850, but make 850 very hard to achieve
    score = Math.max(300, Math.min(850, score));
    
    // Additional realistic caps
    if (stats.total_bets < 20) score = Math.min(score, 650); // Need experience for good scores
    if (stats.total_bets < 50) score = Math.min(score, 750); // Need lots of experience for excellent
    if (totalLoans < 2) score = Math.min(score, 700); // Need loan history for top scores
    
    await db.run('UPDATE gambo_scores SET score = ? WHERE user_id = ?', score, userId);
}

export async function gambo(message: Message, db: Database) {
    // Check for loan defaults first
    await checkLoanDefaults(db, message.author.id);
    
    const score = await ensureGamboScore(db, message.author.id);
    
    let creditRating = '';
    let loanEligibility = '';
    
    if (score.score >= 800) {
        creditRating = '🏆 LEGENDARY (800-850)';
        loanEligibility = '💰 Qualified for premium loans';
    } else if (score.score >= 750) {
        creditRating = '💎 EXCELLENT (750-799)';
        loanEligibility = '💰 Up to 1000 cotton @ 8%';
    } else if (score.score >= 700) {
        creditRating = '🥇 VERY GOOD (700-749)';
        loanEligibility = '💰 Up to 750 cotton @ 12%';
    } else if (score.score >= 650) {
        creditRating = '🥈 GOOD (650-699)';
        loanEligibility = '💰 Up to 500 cotton @ 18%';
    } else if (score.score >= 600) {
        creditRating = '🥉 FAIR (600-649)';
        loanEligibility = '💰 Up to 300 cotton @ 25%';
    } else if (score.score >= 550) {
        creditRating = '📉 POOR (550-599)';
        loanEligibility = '⚠️ Up to 150 cotton @ 35%';
    } else if (score.score >= 500) {
        creditRating = '🚨 VERY POOR (500-549)';
        loanEligibility = '🔥 Up to 75 cotton @ 45%';
    } else {
        creditRating = '💀 SUBPRIME (<500)';
        loanEligibility = '❌ NOT ELIGIBLE FOR LOANS';
    }
    
    const winRate = score.total_bets > 0 ? ((score.total_winnings / (score.total_winnings + score.total_losses)) * 100).toFixed(1) : '0.0';
    
    reply(message.channel, 
        `🎰 **${message.author.username}'s GAMBO Score v3**\n` +
        `**Score:** ${score.score}/850\n` +
        `**Rating:** ${creditRating}\n` +
        `**Loan Status:** ${loanEligibility}\n\n` +
        `📊 **Statistics:**\n` +
        `**Total Bets:** ${score.total_bets}\n` +
        `**Win Rate:** ${winRate}%\n` +
        `**Net Profit:** ${score.total_winnings - score.total_losses} cotton\n` +
        `**Loans Repaid:** ${score.loans_repaid}/${score.loans_repaid + score.loans_defaulted || 'None'}`
    );
}

export async function loan(message: Message, db: Database, args: string[]) {
    const amount = parseInt(args[0]);
    
    if (isNaN(amount) || amount <= 0) {
        reply(message.channel, 'Please specify a valid loan amount! Usage: !loan <amount>');
        return;
    }
    
    if (amount > 1000) {
        reply(message.channel, 'Maximum loan amount is 1000 cotton!');
        return;
    }
    
    if (amount < 10) {
        reply(message.channel, 'Minimum loan amount is 10 cotton!');
        return;
    }
    
    // Check if user already has a loan
    const existingLoan = await db.get('SELECT * FROM loans WHERE user_id = ?', message.author.id);
    if (existingLoan && existingLoan.amount > 0) {
        reply(message.channel, `You already have an outstanding loan of ${existingLoan.amount} cotton! Pay it off first.`);
        return;
    }
    
    // Check GAMBO score for loan approval (like FICO score)
    const score = await ensureGamboScore(db, message.author.id);
    let maxLoanAmount = 0;
    let interestRate = 0.50; // 50% default for worst credit
    
    if (score.score >= 750) {
        maxLoanAmount = 1000;
        interestRate = 0.08; // 8% for excellent credit
    } else if (score.score >= 700) {
        maxLoanAmount = 750;
        interestRate = 0.12; // 12% for very good credit
    } else if (score.score >= 650) {
        maxLoanAmount = 500;
        interestRate = 0.18; // 18% for good credit
    } else if (score.score >= 600) {
        maxLoanAmount = 300;
        interestRate = 0.25; // 25% for fair credit
    } else if (score.score >= 550) {
        maxLoanAmount = 150;
        interestRate = 0.35; // 35% for poor credit
    } else if (score.score >= 500) {
        maxLoanAmount = 75;
        interestRate = 0.45; // 45% for very poor credit
    } else {
        reply(message.channel, 
            `🚨 **LOAN DENIED!** Your GAMBO score (${score.score}) is too low for any loan.\n` +
            `📊 **Minimum Required:** 500 GAMBO Score\n` +
            `💡 **Tip:** Play more games and repay any existing debts to improve your score!`
        );
        return;
    }
    
    if (amount > maxLoanAmount) {
        reply(message.channel, `Your GAMBO score (${score.score}) only qualifies you for up to ${maxLoanAmount} cotton at ${(interestRate * 100)}% interest.`);
        return;
    }
    
    // Approve loan
    const repaymentAmount = Math.ceil(amount * (1 + interestRate));
    const dueDate = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    
    await db.run('INSERT OR REPLACE INTO loans (user_id, amount, interest_rate, due_date) VALUES (?, ?, ?, ?)', 
                 message.author.id, repaymentAmount, interestRate, dueDate);
    
    // Give cotton to user
    const userInventory = await db.get('SELECT * FROM inventory WHERE user_id = ? AND item = ?', message.author.id, 'cotton');
    if (userInventory) {
        await db.run('UPDATE inventory SET quantity = quantity + ? WHERE user_id = ? AND item = ?', amount, message.author.id, 'cotton');
    } else {
        await db.run('INSERT INTO inventory (user_id, item, quantity) VALUES (?, ?, ?)', message.author.id, 'cotton', amount);
    }
    
    reply(message.channel, 
        `💰 **LOAN APPROVED!**\n` +
        `**Amount:** ${amount} cotton\n` +
        `**Interest Rate:** ${(interestRate * 100)}%\n` +
        `**Repayment:** ${repaymentAmount} cotton\n` +
        `**Due:** 7 days\n` +
        `*Failure to repay will hurt your GAMBO score!*`
    );
}

export async function repay(message: Message, db: Database) {
    const loan = await db.get('SELECT * FROM loans WHERE user_id = ?', message.author.id);
    
    if (!loan || loan.amount <= 0) {
        reply(message.channel, 'You don\'t have any outstanding loans!');
        return;
    }
    
    const userInventory = await db.get('SELECT quantity FROM inventory WHERE user_id = ? AND item = ?', message.author.id, 'cotton');
    const userCotton = userInventory?.quantity || 0;
    
    if (userCotton < loan.amount) {
        const daysLeft = Math.ceil((loan.due_date - Date.now()) / (1000 * 60 * 60 * 24));
        reply(message.channel, 
            `You need ${loan.amount} cotton to repay your loan (you have ${userCotton}).\n` +
            `**Days remaining:** ${daysLeft > 0 ? daysLeft : 'OVERDUE!'}`
        );
        return;
    }
    
    // Process repayment
    await db.run('UPDATE inventory SET quantity = quantity - ? WHERE user_id = ? AND item = ?', loan.amount, message.author.id, 'cotton');
    await db.run('DELETE FROM loans WHERE user_id = ?', message.author.id);
    
    // Update GAMBO score
    await db.run('UPDATE gambo_scores SET loans_repaid = loans_repaid + 1 WHERE user_id = ?', message.author.id);
    await recalculateGamboScore(db, message.author.id);
    
    reply(message.channel, 
        `✅ **LOAN REPAID!** You paid back ${loan.amount} cotton.\n` +
        `Your GAMBO score has improved! 📈`
    );
}

export async function pay(message: Message, db: Database, args: string[]) {
    if (!args[0] || !args[1]) {
        reply(message.channel, 'Usage: !pay @user <amount>');
        return;
    }
    
    const mentionedUserId = args[0].replace(/[<@!>]/g, '');
    const amount = parseInt(args[1]);
    
    if (isNaN(amount) || amount <= 0) {
        reply(message.channel, 'Please specify a valid amount!');
        return;
    }
    
    if (mentionedUserId === message.author.id) {
        reply(message.channel, 'You cannot pay yourself!');
        return;
    }
    
    const senderInventory = await db.get('SELECT quantity FROM inventory WHERE user_id = ? AND item = ?', message.author.id, 'cotton');
    const senderCotton = senderInventory?.quantity || 0;
    
    if (senderCotton < amount) {
        reply(message.channel, `You don't have enough cotton! You have ${senderCotton}, need ${amount}.`);
        return;
    }
    
    // Transfer cotton
    await db.run('UPDATE inventory SET quantity = quantity - ? WHERE user_id = ? AND item = ?', amount, message.author.id, 'cotton');
    
    const receiverInventory = await db.get('SELECT * FROM inventory WHERE user_id = ? AND item = ?', mentionedUserId, 'cotton');
    if (receiverInventory) {
        await db.run('UPDATE inventory SET quantity = quantity + ? WHERE user_id = ? AND item = ?', amount, mentionedUserId, 'cotton');
    } else {
        await db.run('INSERT INTO inventory (user_id, item, quantity) VALUES (?, ?, ?)', mentionedUserId, 'cotton', amount);
    }
    
    reply(message.channel, `💸 ${message.author.username} paid ${amount} cotton to <@${mentionedUserId}>!`);
}

// Check for loan defaults (called periodically or when users check their score)
export async function checkLoanDefaults(db: Database, userId?: string) {
    const whereClause = userId ? 'WHERE user_id = ?' : '';
    const params = userId ? [userId] : [];
    
    const overdueLoans = await db.all(
        `SELECT * FROM loans ${whereClause} AND amount > 0 AND due_date < ?`,
        [...params, Date.now()]
    );
    
    for (const loan of overdueLoans) {
        // Mark as defaulted
        await db.run('UPDATE gambo_scores SET loans_defaulted = loans_defaulted + 1 WHERE user_id = ?', loan.user_id);
        
        // Remove the loan
        await db.run('DELETE FROM loans WHERE user_id = ?', loan.user_id);
        
        // Severely hurt GAMBO score
        await recalculateGamboScore(db, loan.user_id);
        
        // Reduce score further as penalty for defaulting
        await db.run('UPDATE gambo_scores SET score = MAX(300, score - 100) WHERE user_id = ?', loan.user_id);
    }
    
    return overdueLoans.length;
}

export async function debt(message: Message, db: Database) {
    // Check for defaults first
    await checkLoanDefaults(db, message.author.id);
    
    const loan = await db.get('SELECT * FROM loans WHERE user_id = ?', message.author.id);
    
    if (!loan || loan.amount <= 0) {
        reply(message.channel, '✅ You have no outstanding debt!');
        return;
    }
    
    const daysLeft = Math.ceil((loan.due_date - Date.now()) / (1000 * 60 * 60 * 24));
    const isOverdue = daysLeft < 0;
    
    reply(message.channel, 
        `💳 **Your Current Debt:**\n` +
        `**Amount Owed:** ${loan.amount} cotton\n` +
        `**Interest Rate:** ${(loan.interest_rate * 100)}%\n` +
        `**Status:** ${isOverdue ? '🚨 OVERDUE!' : `⏰ ${daysLeft} days left`}\n` +
        `${isOverdue ? '**WARNING:** Your GAMBO score is being damaged!' : ''}`
    );
}

export async function reset(message: Message, db: Database) {
    // Only allow specific user to reset the database
    if (message.author.id !== '685580500596686967') {
        reply(message.channel, '🚫 You do not have permission to use this command.');
        return;
    }
    
    try {
        // Clear all tables
        await db.run('DELETE FROM inventory');
        await db.run('DELETE FROM loans'); 
        await db.run('DELETE FROM gambo_scores');
        await db.run('DELETE FROM users');
        
        // Reset auto-increment counters only if the table exists
        try {
            await db.run('DELETE FROM sqlite_sequence');
        } catch (seqError) {
            // sqlite_sequence doesn't exist, which is fine
        }
        
        reply(message.channel, 
            '🗑️ **DATABASE RESET COMPLETE**\n' +
            '✅ All user data cleared\n' +
            '✅ All inventories cleared\n' +
            '✅ All loans cleared\n' +
            '✅ All GAMBO scores cleared\n' +
            '**The bot is now in a fresh state.**'
        );
    } catch (error) {
        reply(message.channel, `❌ **ERROR:** Failed to reset database: ${error}`);
    }
} 