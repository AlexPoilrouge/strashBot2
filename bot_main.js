
const sb= require('./js/bot');

const config= require('config');

let bot= new sb.StrashBot(config.get('StrashBot.token'));

bot.setup()

bot.login();

/** TODO
 *  ** Modify settings saving to have one file per command per guild
 *  ** cmd_main dynamic change of threshold
 *  ** Modify admin attribution determination (role instead of channel - or maybe have 'ctrl channel' (add to utils?) along with role recognition (add isAdmin() to utils?))
 *  ** Unstall particular ID function, to use when role/channel is deleted
 *  ** Rework Commander and whatnot so that it's works when guild is joind during runtime
 *  ** Support guild leave?
 */