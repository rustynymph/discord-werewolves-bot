// Dependecies
var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');

// Game State
let MINIMUM_NUM_PLAYERS = 6; 
var players = [];
var seers = [];
var minRoles = ["werewolf", "werewolf", "seer", "villager", "villager", "villager"];
var gameActive = false;
let mainChannelID = null;
let werewolvesChannelID = null;
let seersChannelID = null;
let playerRoleID = "701542068748681261";
let seerRoleID = "701520972443942972";
let werewolfRoleID = "701520797914759270";
let deadPlayerRoleID = "701575182174912624";
let seerTurn = false;
let werewolvesTurn = false;
let villagersTurn = false;
let killVotes = [];
let lynchVotes = [];
let newDead = [];
var seer = null;
var day = false;
var firstNightRound = false;
const allEqual = arr => arr.every( v => v === arr[0] )

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';
// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');

    mainChannelID = "701486922798989315";
    var p = bot.channels;
    for (var key in p) {
        if (p.hasOwnProperty(key)) {
            if (p[key].name == "seers")
                seersChannelID = key;
            if (p[key].name == "werewolves")
                werewolvesChannelID = key;
        }
    }

    bot.sendMessage({
        to: mainChannelID,
        message: "```Welcome to Werewolves!\nAll users who want to play must type !join.\nWhen everyone has done this, someone can type !start to begin the game.\nYou can reset everything and end the game by typing !reset.```\n"
    });     

});
bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);
        switch(cmd) {
            case 'join':
                if (channelID == mainChannelID) {
                    if (!doesPlayerExist(userID)) {
                        players.push(new Player(user, userID));
                        bot.addToRole({"serverID": "701486922798989312", "userID": userID, "roleID": playerRoleID});
                    }
                    bot.sendMessage({
                        to: channelID,
                        message: "```Players that have joined: \n"  + generatePlayersList() + "```\n"
                    });
                }
                break;
            case 'start':
                if (channelID == mainChannelID) {
                    if (players.length >= MINIMUM_NUM_PLAYERS) { // change MINIMUM_NUM_PLAYERS back to 5 later
                        if (!gameActive) {
                            startGame(channelID, message);
                        } else {
                            bot.sendMessage({
                                to: channelID,
                                message: "```There is already an ongoing game.```\n"
                            });                        
                        }
                    } else {
                        bot.sendMessage({
                            to: channelID,
                            message: "```You need 6+ players to play werewolves.```\n"
                        });                    
                    }
                }
                break;
            case 'reset':
                if (channelID == mainChannelID) reset();
                break;
            case 'kill': // werewolves, werewolves have to agree 
                if (channelID == werewolvesChannelID) {
                    var werewolf = findPlayerByName(user); 
                    werewolf.kill(args[0]);              
                } else {
                    bot.sendMessage({
                        to: channelID,
                        message: '```You must use the werewolves channel to do werewolf stuff.```\n'
                    });                      
                }       
                break;
            case 'lynch': // everyone gets to vote to lynch, majority wins
                if (channelID == mainChannelID) { // lynch voting happens publicy
                    var player = findPlayerByName(user);
                    player.lynch(args[0]);
            }
                break;
            case 'reveal': // seers
                if (channelID == seersChannelID) {
                    // might need way to check if seer, but can do this with seer channel permissions i guess

                    seer.reveal(args[0]);

                } else {
                    bot.sendMessage({
                        to: channelID,
                        message: '```You must use the seers channel to do seer stuff.```\n'
                    });                      
                }         
                break;
         }
     }
});

bot.on('disconnect', function(errMsg, code) {
    reset();
});

function doesPlayerExist(userID) { // so users can't join multiple times
    for (var i = 0; i < players.length; i++) {
        if (players[i].userID == userID) {
            return true;
        }
    }
    return false;
}

function numberOfLivingPlayers() {
    var count = 0;
    for (var i = 0; i < players.length; i++) {
        if (players[i].alive) {
            count++;
        }
    }
    return count;
}

function generatePlayersList() {
    var playersList = "";
    for (var i = 0; i < players.length; i++) {
        playersList += ("- " + players[i].user + "\n");
    }
    return playersList;
}

function startGame(channelID, message) {
    gameActive = true;
    while (players.length > minRoles.length) { // adds more villagers to the game if there are more than 5 players
        minRoles.push("villager");
    }
    minRoles = shuffle(minRoles);
    assignRoles(channelID, message);
    firstNight();
}

function assignRoles(channelID, message) {
    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        var role = minRoles[i];
        var messageContent = "";
        if (role == "seer") {
            seer = new Seer(player.user, player.UserID);
            players[i] = seer;
            messageContent = "```You are a seer! Use the seer channel to reveal a player's identity once per round.```";
            bot.addToRole({"serverID": "701486922798989312", "userID": player.userID, "roleID": seerRoleID});
        } else if (role == "werewolf") {
            var werewolf = new Werewolf(player.user, player.UserID);
            players[i] = werewolf;
            messageContent = "```You are a werewolf! Use the werewolves channel to talk to the other werewolves.```";
            bot.addToRole({"serverID": "701486922798989312", "userID": player.userID, "roleID": werewolfRoleID});
        } else {
            player.role = "villager";
            messageContent = "```You are a villager!```";
        }
        bot.sendMessage({
            to: player.userID,
            message: messageContent
        });   
    }

    // remove eventually
    var testmessage = "CURRENT GAME STATE: \n";
    for (var i = 0; i < players.length; i++) {
        testmessage += ("- " + players[i].user + " " + players[i].getRole() + " " + players[i].alive + " " + "\n");
    }
    logger.info(testmessage);

    bot.sendMessage({
        to: mainChannelID,
        message: "```" +
                 "You have started a new game! Check your DMs for a message from the bot telling you what your role is.\n\n" +
                 "Werewolves\n" + "==========" + "\n" +
                 "Your job is to remain undetected by the villagers. You can use the #werewolves channel to talk to the other werewolves. Each night you will have to vote unanimously on who to kill. You do so by typing !kill user_name of the person you want to kill in the #werewolves channel.\n\n" +
                 "Villagers\n" + "==========" + "\n" + 
                 "Your job is to kill all the werewolves.\n\n" +
                 "Seer\n" + "==========" + "\n" + 
                 "You are also a villager, but each night in the #seers channel you can choose to reveal the identity of someone using: !reveal user_name\n\n" +
                 "Each night the seer can reveal someone's role, the werewolves will kill someone. During the day, all players will vote who gets lynched by typing !lynch user_name in the #general channel.\n" +
                 "The villagers win when all the werewolves are dead, the werewolves win when they outnumber the villagers.\n\n" +
                 "Right now, seer --- please use the #seers channel to reveal someone's identity." +
                 "```\n"
    });
    firstNight();
}

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
  
    while (0 !== currentIndex) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
    return array;
  }

function reset() {
    for (var i = 0; i < players.length; i++) {
        bot.removeFromRole({"serverID": "701486922798989312", "userID": players[i].userID, "roleID": playerRoleID});
        bot.removeFromRole({"serverID": "701486922798989312", "userID": players[i].userID, "roleID": deadPlayerRoleID});
        bot.removeFromRole({"serverID": "701486922798989312", "userID": players[i].userID, "roleID": seerRoleID});
        bot.removeFromRole({"serverID": "701486922798989312", "userID": players[i].userID, "roleID": werewolfRoleID});
    }

    players = [];
    seers = [];
    seer = null;
    werewolves = [];
    killVotes = [];
    lynchVotes = [];
    seerTurn = false;
    werewolvesTurn = false;
    villagersTurn = false;
    gameActive = false;

    bot.sendMessage({
        to: mainChannelID,
        message: '```Reset game. You must all rejoin the game using !join and start when ready by typing !start.```'
    });
}

function firstNight() {
    day = false;
    firstNightRound = true;
    seer.votedReveal = false; // seer needs to vote now
}

function newNight() {
    day = false;
    firstNightRound = false;
    killVotes = [];
    newDead = [];

    for (var i = 0; i < players.length; i++) { // the seer and werewolves get turns
        var player = players[i];
        if ((player.getRole() == "seer") && player.alive){
            player.votedReveal = false;
        } else if ((player.getRole() == "werewolf") && player.alive) {
            player.votedKill = false;
        } 
    }

    bot.sendMessage({
        to: mainChannelID,
        message: "```It is now night.\nSeer, choose a player to reveal.\nWerewolves, choose a villager to kill.```\n"
    });   

}

function newDay() {
    day = true;
    firstNightRound = false;
    lynchVotes = [];
    var whoDiedMessage = "";

    if (newDead.length == 0) {
        whoDiedMessage += "Nobody";
    }
    else {
        for (var i = 0; i < newDead.length; i++) {
            var person = newDead[i];
            person.alive = false;
            whoDiedMessage += (person.user + " ");
            bot.addToRole({"serverID": "701486922798989312", "userID": person.userID, "roleID": deadPlayerRoleID});
        }
    }
    whoDiedMessage += " died during the night.\n";
    newDead = [];

    var voteInstructions = "It is now time to vote who to lynch. Type !lynch name_of_user_you_vote_for to cast your vote.```\n"

    for (var v = 0; v < players.length; v++) { // all living players get to vote to lynch
        var player = players[v];
        player.votedLynch = false;
    }

    bot.sendMessage({
        to: mainChannelID,
        message: "```It is a new day.\n" + whoDiedMessage + voteInstructions
    });  
}

function findPlayerByName(name) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].user == name) {
            return players[i];
        }
    }
    return null;
}

function werewolfRevote() {
    killVotes = [];
    for (var v = 0; v < players.length; v++) {
        var player = players[v];
        if (player.getRole() == "werewolf" && player.alive) {
            werewolf.votedKill = false;
        }
    }    
}

function villagersRevote() {
    lynchVotes = [];
    for (var v = 0; v < players.length; v++) {
        var player = players[v];
        player.votedLynch = false;
    }
}

function tallyVotes() {
    var votes = {};
    for (var v = 0; v < lynchVotes.length; v++) {
        var person = lynchVotes[v];
        if (votes[person.user] ) {
            votes[person.user] += 1;
        } else {
            votes[person.user] = 1;
        }
    }

    var max = 0;
    var toBeKilled = [];
    for (var key in votes) {
        if (votes.hasOwnProperty(key)) {
            if (votes[key] > max) {
                max = votes[key];
                toBeKilled = [findPlayerByName(key)];
            } else if (votes[key] == max) {
                toBeKilled.push(findPlayerByName(key));
            }
        }
    }
    return toBeKilled;
}

function numberOfActiveWerewolves() {
    var count = 0;  
    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if ((player.getRole() == "werewolf") && player.alive) {
            count += 1;
        }
    }
    return count;
}

function numberOfActiveVillagers() {
    var count = 0;  
    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if ((player.getRole() != "werewolf") && player.alive) {
            count += 1;
        }
    }
    return count;    
}

function checkIfGameOver() {
    if (numberOfActiveWerewolves() >= numberOfActiveVillagers()) {
        bot.sendMessage({
            to: mainChannelID,
            message: "```Game over. Werewolves win!```\n"
        });          
        gameActive = false;
        reset();
        return true;
    }
    else if (!numberOfActiveWerewolves()) {
        bot.sendMessage({
            to: mainChannelID,
            message: "```Game over. Villagers win!```\n"
        });          
        gameActive = false;
        reset();
        return true;
    }
    return false;
}

function werewolvesDoneVoting() {
    var done = true;
    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if ( (player.getRole() == "werewolf") && ( !player.alive || !player.votedKill ) ) {
            done = false;
        }
    }
    return done;
}


/* Player Role Prototypes */
class Player {
    constructor(user, userID) {
        this.user = user;
        this.userID = userID;
        this.alive = true;
        this.votedLynch = false;
        this.turn = false;
        this.role = "villager";
    }

    getRole() {
        return this.role;
    }

    lynch(playerChoice) {
        var player = findPlayerByName(playerChoice);
        if (!day) {
            bot.sendMessage({
                to: mainChannelID,
                message: "```"+ this.user + ", you can't vote to lynch at night.```\n"
            });              
            return;
        }

        if (!this.alive) {
            bot.sendMessage({
                to: mainChannelID,
                message: "```"+ this.user + ", you are dead. You can't vote.```\n"
            });    
            return;                    
        }

        if (!this.votedLynch) {
            if (this.user == playerChoice) {    
                bot.sendMessage({
                    to: mainChannelID,
                    message: "```"+ this.user + ", you can't vote for yourself.```\n"
                });  
            } else if (player) { // player was found and exists
                if (!player.alive) {
                    bot.sendMessage({
                        to: mainChannelID,
                        message: "```"+ this.user + ", you can't vote for a player that is already dead.```\n"
                    });                                     
                } else {
                    this.votedLynch = true;
                    lynchVotes.push(player);
                    if (lynchVotes.length == numberOfLivingPlayers()) { // done voting to lynch
                        var playersToLynch = tallyVotes();
                        for (var i = 0; i < playersToLynch.length; i++) {
                            var player = playersToLynch[i];
                            player.alive = false;
                            bot.addToRole({"serverID": "701486922798989312", "userID": player.userID, "roleID": deadPlayerRoleID});
                            bot.sendMessage({
                                to: mainChannelID,
                                message: "```" + player.user + " is dead.```\n"
                            });                                             
                        }
                        if (!checkIfGameOver()) {
                            newNight();
                        }
                    }
                }
            } else {
                bot.sendMessage({
                    to: mainChannelID,
                    message: "```"+ this.user + ", the name of the player you typed was not found.```\n"
                });                              
            }
    } else { // this player voted & is alive
        bot.sendMessage({
            to: mainChannelID,
            message: "```"+ this.user + ", you have already voted.```\n"
        });                       
    }
    }
}

class Werewolf extends Player {
    constructor(user, userID) {
        super(user, userID);
        this.votedLynch = false;
        this.votedKill = false;
        this.role = "werewolf";
    }

    kill(playerChoice) {
        if (day || firstNightRound) {
            bot.sendMessage({
                to: werewolvesChannelID,
                message: "```You can't vote right now.```\n"
            });    
            return;                         
        }

        if (!this.votedKill) { // this werewolf hasn't voted yet
            if (this.user == playerChoice) { // check to make sure not voting for themselves 
                bot.sendMessage({
                    to: werewolvesChannelID,
                    message: "```"+ this.user + ", you can't vote for yourself.```\n"
                });     
                return;                      
            } else {
                var player = findPlayerByName(playerChoice);
                if (player) {
                    if ((player.getRole() == "werewolf") || (!player.alive)) {
                        bot.sendMessage({
                            to: werewolvesChannelID,
                            message: "```"+ this.user + ", you must choose a player that is alive, and not a werewolf.```\n"
                        });                                   
                    } else {
                        killVotes.push(player)
                        this.votedKill = true;
                        if (werewolvesDoneVoting()) {
                        //if (killVotes.length == numberOfActiveWerewolves()) {
                            if (allEqual(killVotes)) {
                                bot.sendMessage({
                                    to: werewolvesChannelID,
                                    message: "```You have decided to kill: " + player.user + ".```\n"
                                }); 
                                newDead.push(player);
                                if (seer.votedReveal && werewolvesDoneVoting()) {
                                    newDay();
                                }  
                            } else {
                                werewolfRevote();
                                bot.sendMessage({
                                    to: werewolvesChannelID,
                                    message: "```You did not come to a unanimous decision, please revote.```\n"
                                }); 
                            }
                        }
                    }
                } else { // probably tryped player name wrong
                    bot.sendMessage({
                        to: werewolvesChannelID,
                        message: "```"+ werewolf.user + ", the player whose name you typed can't be found.```\n"
                    });                                 
                }
                return;
            }
        } else if (!werewolf.alive) {
            bot.sendMessage({
                to: werewolvesChannelID,
                message: "```"+ werewolf.user + ", you are dead. You can't vote.```\n"
            });   
        }
        else {
            bot.sendMessage({
                to: werewolvesChannelID,
                message: "```"+ werewolf.user + ", you have already voted.```\n"
            });                             
        } 
    }
}

class Seer extends Player {
    constructor(user, userID) {
        super(user, userID);
        this.votedReveal = false;
        this.votedLynch = false;
        this.role = "seer";
    }

    reveal(playerChoice) {
        if (day || this.votedReveal) { // check if it's the seer's turn
            bot.sendMessage({
                to: seersChannelID,
                message: "```Seer, it is not your turn.```\n"
            });                          
            return;
        }

        //if (!findPlayerByName(user).alive) {
        if (!this.alive) {
            bot.sendMessage({
                to: seersChannelID,
                message: "```Seer, you are dead, you can't reveal anyone.```\n"
            });                          
            return;
        }

        if (this.user == playerChoice) {
            bot.sendMessage({
                to: seersChannelID,
                message: "```You can't choose yourself, pick another living player.```\n"
            });
            return;                         
        } else {
            var player = findPlayerByName(playerChoice); 
            if (player) {
                if (player.alive) {
                    bot.sendMessage({
                        to: seersChannelID,
                        message: "```" + player.user + " is a " + player.getRole() + ".```\n"
                    });
                    this.votedReveal = true;
                    if (this.votedReveal && (werewolvesDoneVoting() || firstNightRound)) { //fix the werewolvesTurn variable, needs to check all werewolves' turns
                        if (!checkIfGameOver()) {
                            newDay();
                        }
                    }                           
                    return;                              
                } else {
                    bot.sendMessage({
                        to: seersChannelID,
                        message: "```Please choose a living player.```\n"
                    });  
                    return;                              
                }
            } else {
                bot.sendMessage({
                    to: seersChannelID,
                    message: "```Player not found.```\n"
                });  
                return;
            }
        }
    }
}