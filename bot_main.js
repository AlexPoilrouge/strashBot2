
const sb= require('./js/bot');

const config= require('config');

let bot= new sb.StrashBot(config.get('StrashBot.token'));

bot.setup()

bot.login();

/** TODO
 *  ** Add !reload master command to reload guildconfigs and settings from persistent memory.
 *  ** Add posibility for a module to access settings data managed by another module
 *  ** User previous to fix the bug that suppress a "main" role when someone goes to jail or is silenced.
 */