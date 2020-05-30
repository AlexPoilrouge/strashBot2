
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;

const child_process= require("child_process");



let hereLog= (...args) => {console.log("[cmd_kart]", ...args);};



function _stopServer(){
    b= false;
    try{
        child_process.execSync("sudo systemctl stop srb2kart_serv", {timeout: 4000});
        b= true;
    }
    catch(err){
        hereLog("Error while stopping server: "+err);
        b= false;
    }
    return b;
}

function _startServer(){
    b= false;
    try{
        child_process.execSync("sudo systemctl start srb2kart_serv", {timeout: 4000});
        b= true;
    }
    catch(err){
        hereLog("Error while launching server: "+err);
        b= false;
    }
    return b;
}

function _isServerRunning(){
    b= false;
    try{
        child_process.execSync("systemctl is-active srb2kart_serv", {timeout: 4000});
        b= true;
    }
    catch(err){
        hereLog("Evaluating if server active: "+err);
        b= false;
    }

    return b;
}

function _getPassword(){
    b= false;
    stdout= undefined;
    try{
        stdout=child_process.execSync("cat ${HOME}/.TMP_PASS", {timeout: 4000}).toString().replace('\n','');
        b= true;
    }
    catch(err){
        hereLog("Accessing srb2k server password: "+err);
        b= false;
    }

    if(!Boolean(stdout) || !b){
        return "password not found";
    }

    return stdout;
};


function cmd_init(utils){

}


async function cmd_init_per_guild(utils, guild){
    var servOwner= utils.settings.get(guild, "serv_owner");
    var m_owner= undefined;
    if( Boolean(servOwner) &&
        (!Boolean(m_owner= await guild.fetchMember(servOwner)) || !_isServerRunning())    
    ){
        utils.settings.remove(guild, "serv_owner");
    }

    var chanKart= utils.settings.get(guild, 'kart_channel');
    var channel= undefined;
    if(!Boolean(chanKart) || !Boolean(channel= guild.channels.get(chanKart))){
        if(Boolean(m_owner)){
            var chanKart= utils.settings.remove(guild, 'serv_owner');
            if(_isServerRunning()){
                _stopServer();
            }
        }
    }
}


async function cmd_main(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let args= cmdObj.args;
    if(args[0]==="channel" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        if(args[1]==="clear"){
            utils.settings.remove(message.guild, 'kart_channel');

            if(_isServerRunning()){
                _stopServer();
            }

            return true;
        }
        else if(args[1]==="which"){
            var chanKart= utils.settings.get(message.guild, 'kart_channel');
            var channel= undefined;
            if(!Boolean(chanKart) || !Boolean(channel=message.guild.channels.get(chanKart))){
                message.author.send("No channel set as *dedicated srb2kart channel*…");

                return true;
            }
            else{
                message.author.send(`Channel \"${channel}\" is set as the *dedicated srb2kart channel*…`);

                return true;
            }
        }
        var channel= undefined
        if(!Boolean(message.mentions) || !Boolean(message.mentions.channels) || !Boolean(channel=message.mentions.channels.first())){
            message.member.send("[kart command] No mention to any channel found… Format is:\n\t`!karthannel #channelmention`");

            return false;
        }

        utils.settings.set(message.guild, 'kart_channel', channel.id);

        return true;

    }
    else{
        var chanKart= utils.settings.get(message.guild, 'kart_channel');
        if(!Boolean(chanKart) || chanKart!==message.channel.id){
            message.member.send(`[kart command] command \`!kart ${args[0]}\` only possible in dedicated kart channel…`);
            return false;
        }

        if(["run","launch","start","go","vroum"].includes(args[0])){
            var chanKart= utils.settings.get(message.guild, 'kart_channel');
            if(!Boolean(chanKart) || chanKart!==message.channel.id){
                message.member.send(`[kart command] command \`!kart ${args[0]}\` only possible in dedicated kart channel…`);
                return false;
            }

            if(_isServerRunning()){
                str="Server SRB2Kart is already running…";

                var servOwner= utils.settings.get(message.guild, "serv_owner");
                var owner= undefined;
                if(!Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().fetchUser(servOwner))){
                    str+=`\n\t⚠ **ERROR:** no SRB2Kart server owner found!!!`;
                }
                else{
                    str+=`\n\t*Server owner is ${owner}*`;
                }
                message.channel.send(str);
            }
            else{
                _startServer();

                var success= _startServer();

                if(!success){
                    _stopServer();
                    message.member.send(`[kart command] unable to start SRB2Kart server…`);

                    return false;
                }

                pwd= _getPassword();
                utils.settings.set(message.guild, "serv_owner", message.member.id);
                message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                message.channel.send("Strashbot srb2kart server started…");

                return true;
            }
        }
        else if(["halt","quit","stop","nope","kill","shutdown"].includes(args[0])){
            var chanKart= utils.settings.get(message.guild, 'kart_channel');
            if(!Boolean(chanKart) || chanKart!==message.channel.id){
                message.member.send(`[kart command] command \`!kart ${args[0]}\` only possible in dedicated kart channel…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (!Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().fetchUser(servOwner))) ||
                ((clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) || (owner.id===message.author.id))
            ){
                _stopServer();
                message.channel.send("Strashbot srb2kart server stopped…");
                utils.settings.remove(message.guild, "serv_owner");
                return true;
            }
            else{
                message.channel.send("Seule la personne qui a lancé le serveur SRB2Kart peut le stopper…");
                return false;
            }
        }
        else if(["password","pwd","access","admin"].includes(args[0])){
            var chanKart= utils.settings.get(message.guild, 'kart_channel');
            if(!Boolean(chanKart) || chanKart!==message.channel.id){
                message.member.send(`[kart command] command \`!kart ${args[0]}\` only possible in dedicated kart channel…`);
                return false;
            }

            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) || 
                (Boolean(servOwner) && Boolean(owner= await utils.getBotClient().fetchUser(servOwner)) && (owner.id===message.author.id) )
                || !Boolean(servOwner) || !Boolean(owner)
            ){
                pwd= _getPassword();
                message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`)
                return true;
            }

            return false;
        }
        else if(["takeover","claim","seize","force","own","lock","lead","control","ctrl"].includes(args[0])){
            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }
            if( (clearanceLvl>CLEARANCE_LEVEL.ADMIN_ROLE)
                || !Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().fetchUser(servOwner))
            ){
                hereLog(`servOwner: ${servOwner} - owner: ${owner}`)
                pwd= _getPassword();
                message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                utils.settings.set(message.guild, "serv_owner", message.member.id);
                message.channel.send(`Nouvel admin désigné du serveur SRB2Kart: ${owner}…`);

                return true;
            }
            else{
                message.channel.send(`Le serveur SRB2Kart a toujours un admin désigné (${owner})…`);

                return false;
            }

        }
        else if(["give","chown","transfer"].includes(args[0])){
            var member= undefined
            if(!Boolean(message.mentions) || !Boolean(message.mentions.members) || !Boolean(member=message.mentions.members.first())){
                message.member.send(`[kart command] No mention to any user found… Format is:\n\t\`!kart ${args[0]} @usermention\``);

                return false;
            }

            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) ||
            ( Boolean(servOwner) && Boolean(owner= await utils.getBotClient().fetchUser(servOwner)) && owner.id===message.author.id)
            ){
                pwd= _getPassword();
                member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame, utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                utils.settings.set(message.guild, "serv_owner", member.id);
                message.channel.send(`Nouvel admin désigné du serveur SRB2Kart: ${member}…`);

                return true
            }
            else{
                message.member.send(`Only the owner of the SRB2Kart server (or discord guild admin) can transfer ownership…`);

                return false;
            }
        }
        else if(["leave","quit","ragequit","unlock","disown","alone","gone","flee","john"].includes(args[0])){
            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (clearanceLvl<=CLEARANCE_LEVEL.ADMIN_ROLE) ||
            ( Boolean(servOwner) && Boolean(owner= await utils.getBotClient().fetchUser(servOwner)) && owner.id===message.author.id)
            ){
                utils.settings.remove(message.guild, "serv_owner");
                message.channel.send(`⚠ Le serveur SRB2Kart n'a plus d'admin désigné… 😢\n`+
                    `\t⚠ Il faut qu'un joueur récupère la propriété en utilisant la commande \`!kart claim\`!`
                );

                return true;
            }
        }
        else if(["server","info","about","?"].includes(args[0])){
            str="";
            if(_isServerRunning()){
                str+="Strashbot SRB2Kart server is running!"

                var servOwner= utils.settings.get(message.guild, "serv_owner");
                var owner= undefined;
                if(Boolean(servOwner) && Boolean(owner= await utils.getBotClient().fetchUser(servOwner))){
                    str+=`\nL'admin désigné du serveur SRB2Kart est **${owner.username}**.`;
                }
                else{
                    str+=`\n⚠ Le serveur SRB2Kart n'a pas d'admin désigné… 😢`;
                }
            }
            else{
                str+="Strashbot SRB2Kart server is inactive!";
            }

            if(str){
                message.channel.send(str);
                return true;
            }
        }
        else if (args[0]==="help"){
            return cmd_help(cmdObj, clearanceLvl)
        }
    }

    return false;
}


function cmd_help(cmdObj, clearanceLvl){
    cmdObj.msg_obj.author.send(
        "⚠ **_IMPORTANT:_** SRB2Kart server is exclusively for Strasbourg Smasher's usage. Please **always** shutdown the server (`!kart stop`) once the playing session is over\n\n"+
        `__**kart** command___:\n\n`+
        ((clearanceLvl<CLEARANCE_LEVEL.ADMIN)? "": ("**Admins only (usable in other channels):**\n\n"+
            "\t`!kart channel #channelmention`\n\n"+
            "\tset which channel gets to be the *designated srb2kart channel*\n\n"+
            "\t`!kart channel clear`\n\n"+
            "\tunset the *designated srb2kart channel*\n\n"+
            "\t`!kart channel which`\n\n"+
            "\ttells which channel is set as the *designated srb2kart channel*\n\n"+
            "**All users commands:**\n"
        )) +
        "**Following commands are only usable in the designated \"srb2kart channel\"!**\n\n"+
        "\t`!kart start`\n\n"+
        "\tTry to start the SRB2Kart server.\n\tIf success, the server password is send via private message, the reciever is considered as the *designated admin* of the server.\n\n"+
        "\t`!kart stop`\n\n"+
        "\tIf active, attempt to stop the SRB2Kart server.\n\n"+
        "\t`!kart password`\n\n"+
        "\tRequest to recieve the password of the active (if any) SRB2Kart server. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "\t`!kart claim`\n\n"+
        "\tClaim the vacant ownership of the current running (if any) SRB2Kart server. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "\t`!kart transfer @usermention`\n\n"+
        "\tGive the ownership of the current running (if any) SRB2Kart server to the mentionned user. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "\t`!kart leave`\n\n"+
        "\tGive up the ownership of the current running (if any) SRB2Kart server, leaving it vacant. (designated SRB2Kart server admin only)\n\n"+
        "\t`!kart info`\n\n"+
        "\tDisplay whether of not the SRB2Kart server is running along with its ownership\n\n"+
        "\t`!kart help`\n\n"+
        "\tDisplay this help (PM)"
    );
    return true;
}


function cmd_event(eventName, utils){
    if(eventName==="channelDelete"){
        var channel= arguments[2];

        var chanKart= utils.settings.get(channel.guild, 'kart_channel');
        if(!Boolean(chanKart)) return false;

        if(channel.id===chanKart){
            if(!_isServerRunning()){
                _stopServer();
            }

            utils.settings.remove(channel.guild, 'kart_channel');
            utils.settings.remove(channel.guild, "serv_owner");

            return true;
        }

        return false;
    }
    else if(eventName==="guildMemberUpdate"){
        var member= arguments[2];

        var servOwner= utils.settings.get(member.guild, "serv_owner");
        var m_owner= undefined;
        if( Boolean(servOwner) && Boolean(await (m_owner= member.guild.fetchMember(servOwner))) && m_owner.id===member.id){
            utils.settings.remove(member.guild, "serv_owner");

            if(_isServerRunning()){
                var chanKart= utils.settings.get(member.guild, 'kart_channel');
                var channel= undefined;
                if(Boolean(chanKart) && Boolean(channel= member.guild.channels.get(chanKart))){
                    channel.send(`⚠ Le serveur SRB2Kart n'a plus d'admin désigné… 😢`+
                        `\t⚠ Il faut qu'un joueur récupère la propriété en utilisant la commande \`!kart claim\`!`
                    );
                }
            }
        }
    }
}


function cmd_guild_clear(guild){}


module.exports.name= ['kart'];
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};