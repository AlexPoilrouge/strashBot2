
const sb= require('./js/bot');

const config= require('config');

let bot= new sb.StrashBot(config.get('StrashBot.token'));

bot.setup()

bot.login();

/** TODO
 *  ** Add !reload master command to reload guildconfigs and settings from persistent memory.
 */