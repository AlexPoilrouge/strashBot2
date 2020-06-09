
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;
const splitString= require('../utils').splitString;

const child_process= require("child_process");
const fs= require( 'fs' );
const path= require( 'path' );
const request = require('request');
const urlExistSync = require("url-exist-sync");



let hereLog= (...args) => {console.log("[cmd_kart]", ...args);};

var kart_settings= undefined;

function __loadingJSONObj(fileName){
    var fn= path.resolve(__dirname,fileName)
    if(fs.existsSync(fn)){
        var data= fs.readFileSync(fn);

        var r= undefined;
        if(Boolean(data) && Boolean(r=JSON.parse(data))){
            return r;
        }
        else{
            hereLog(`[Settings] Error reading data from '${fileName}'`);
            return undefined;
        }
    }
    else{
        return undefined;
    }
}

function _stopServer(){
    b= false;
    try{
        var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.stop))?cmd:"false";
        child_process.execSync(cmd, {timeout: 4000});
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
        var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.start))?cmd:"false";
        child_process.execSync(cmd, {timeout: 4000});
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
        var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.is_active))?cmd:"false";
        child_process.execSync(cmd, {timeout: 4000});
        b= true;
    }
    catch(err){
        hereLog("Evaluating if server active: "+err);
        b= false;
    }

    return b;
}

function _initAddonsConfig(){
    b= false;
    try{
        var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.init))?cmd:"false";
        child_process.execSync(cmd, {timeout: 4000});
        b= true;
    }
    catch(err){
        hereLog("Error while updating addons: "+err);
        b= false;
    }
    return b;
}

function _updateAddonsConfig(){
    b= false;
    try{
        var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.update))?cmd:"false";
        child_process.execSync(cmd, {timeout: 4000});
        b= true;
    }
    catch(err){
        hereLog("Error while updating addons: "+err);
        b= false;
    }
    return b;
}

function _listAddonsConfig(arg=""){
    var str= undefined;
    try{
        var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.list))?cmd:"false";
        str= child_process.execSync(cmd+((Boolean(arg))?` ${arg}`:""), {timeout: 4000});
    }
    catch(err){
        if(Boolean(err.status) && err.status===3){
            str="No result found…";
        }
        else{
            hereLog("Error while listing addons: "+err);
            str= undefined;
        }
    }
    return str;    
}

function _removeAddonsConfig(arg){
    var str= undefined;
<<<<<<< Updated upstream
    try{
        var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.remove))?cmd:"false";
        str= child_process.execSync(cmd+` ${arg}`, {timeout: 4000});
    }
    catch(err){
        hereLog("Error while removing addons: "+err);
        str= undefined
    }
    return str; 
=======
    var r=false;
    try{
        var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.remove))?cmd:"false";
        str= child_process.execSync(cmd+` ${arg}`, {timeout: 4000});
        r=true;
    }
    catch(err){
        hereLog("Error while removing addons: "+err);
    }
    return [r,str]; 
>>>>>>> Stashed changes
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
    if(!Boolean(kart_settings=__loadingJSONObj("data/kart.json"))){
        hereLog("Not able to load 'kart.json' setting…");
    }
    _initAddonsConfig();
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

async function __downloading(channel, url, utils, permanent=false){
    var filename= url.split('/').splice(-1)[0];

    var _ls="";
    if ((_ls=_listAddonsConfig(filename))!=="No result found…"){
        channel.send(`The following addons already exist on server:\n${_ls}`);

        return;
    }

    let _serv_run= _isServerRunning();
    if (_serv_run && !permanent){
        channel.send(`❌ Il est futil d'ajouter un addon *temporaire* alors qu'une session est déjà en cours…`);
        return;
    }

    if (!urlExistSync(url)){
        channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);
        return
    }

    var pct= 0;
    var dl_msg= await channel.send(
        `Downloading \`${filename}\` on server …\t[${pct} %]`
    );

    let _error= (msg='') => {
        if (Boolean(dl_msg)){
            dl_msg.edit(`Downloading \`${filename}\` on server …\t[ERROR!]`+
                ((Boolean(msg))?`\n\t(${msg})`:'')
            );

            dl_msg.react('❌');
        }
    }

    if(!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ||
        (permanent && !Boolean(kart_settings.dirs.dl_dirs.permanent)) ||
        (!permanent && !Boolean(kart_settings.dirs.dl_dirs.temporary))
    ){
        _error();

        return;
    }

    if(Boolean(dl_msg)){
        let filepath= kart_settings.dirs.main_folder+'/'+
            ((permanent)?kart_settings.dirs.dl_dirs.permanent:kart_settings.dirs.dl_dirs.temporary)
            +'/'+filename;
        const file = fs.createWriteStream(filepath);
        var receivedBytes = 0;
        var totalBytes= 0;

        var t= Date.now();

        request.get(url)
            .on('response', (response) => {
                if (response.statusCode !== 200) {
                    _error('Response status was ' + response.statusCode);
                }

                totalBytes= response.headers['content-length'];
            })
            .on('data', (chunk) => {
                receivedBytes += chunk.length;

                if (Boolean(dl_msg) && (Date.now()-t>=2000)){
                    dl_msg.edit(`Downloading \`${filename}\` on server …\t[${(receivedBytes/totalBytes)*100} %]`);
                    t= Date.now();
                }
            })
            .pipe(file)
            .on('error', (err) => {
                fs.unlink(filepath, err => {
                    hereLog(`[file dl error] ${err}`)
                });
                _error();
            });

            file.on('finish', () => {
                file.close();

                if (Boolean(dl_msg)){
                    dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

                    dl_msg.react('✅');
                }

                if(!_updateAddonsConfig()){
                    channel.send(`❌ An error as occured, can't properly add \`${filename}\` to the server addons…`);
                }
                else if(_serv_run){
                    var servOwner= utils.settings.get(channel.guild, "serv_owner");
                    var owner= undefined;
                    var str= `\`${filename}\` a bien été ajouté au serveur.\n`+
                        `Cependant, il ne peut être utilisé pour une session déjà en cours`;
                    /*var str= `\`${filename}\` a bien été ajouté à la session en cours.\n`+
                        `Cependant l'admin désigné du serveur srb2kart devra charger l'addon manuellement`;

                    if(!Boolean(servOwner) || !Boolean(owner=(await utils.getBotClient().fetchUser(servOwner)))){
                        owner.send(`L'addon \`${filename}\` a été ajouté au serveur. Utilisez la commande ingame `+
                            `\`addfile "${(permanent)?kart_settings.dirs.dl_dirs.permanent:kart_settings.dirs.dl_dirs.temporary}/${filename}"\``+
                            ` pour l'ajouter à la session en cours.`)
                    } 
                    else{
                        str+= (!permanent)?"":` via la commande \`addfile "${kart_settings.dirs.dl_dirs.temporary}/${filename}"\``;
                    }*/
                    channel.send(str+'.')         
                }
                else{
                    channel.send(`\`${filename}\` a bien été ajouté et sera disponible prêt à l'emploi lors de la prochaine session.`);
                }
            });
        
            file.on('error', (err) => {
                fs.unlink(filepath, err => {
                    hereLog(`[file dl error] ${err}`)
                });
                _error(err.message);
            });
    }
}

async function _cmd_addons(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(["try","add","get","new"].includes(args[0])){
        var perma= false;
        var url_rgx= /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/;
        var url= undefined;
        if(Boolean(args[1])){
            if(["keep","dl","perma","fixed","final","dl"].includes(args[1])){
                perma= true;
                args= args.slice(1);
            }
            else if(!args[1].match(url_rgx)){
                message.channel.send(`'${args[1]}' is not a recognized instruction or url…`);

                return false;
            }
        }

        if(Boolean(args[1]) && args[1].match(url_rgx)){
            url= args[1]            
        }
        else if(Boolean(message.attachments) && message.attachments.size>=1){
            url= message.attachments.first().url;
        }

        let ext= [".pk3",".wad",".lua",".kart",".pk7"];
        if(Boolean(url) && ext.some(e => {return url.endsWith(e)})){
            __downloading(message.channel, url, utils, perma)

            return true;
        }
        else{
            message.channel.send(`Seuls les fichiers addons d'extension \`${ext}\` sont acceptés…`)

            return false
        }
    }
    else if(["keep","perma","fixed","final","dl"].includes(args[0])){
        if(Boolean(args[1])){
            var str= undefined
<<<<<<< Updated upstream
            try{
                var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.keep))?cmd:"false";
                str= child_process.execSync(cmd+` ${args[1]}`, {timeout: 4000});
=======
            var b=false;
            try{
                var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.keep))?cmd:"false";
                str= child_process.execSync(cmd+` ${args[1]}`, {timeout: 4000});
                b=true;
>>>>>>> Stashed changes
            }
            catch(err){
                hereLog("Error while keeping addons: "+err);
                str= undefined
            }

<<<<<<< Updated upstream
            if(Boolean(str)){
=======
            if(b && Boolean(str)){
>>>>>>> Stashed changes
                message.channel.send(str);

                return true;
            }
            else{
<<<<<<< Updated upstream
                message.channel.send(`No addon *${args[1]}* found in ***[temporary]*** section…`);
=======
                message.channel.send(`Unable to move addon *${args[1]}* to **temporary** section${(Boolean(str))?`:\n\t${str}`:"…"}`);
>>>>>>> Stashed changes

                return false;
            }
        }
    }
    else if(["rm","remove","del","delete","suppr"].includes(args[0])){
        if(Boolean(args[1])){
            var resp= _removeAddonsConfig(args[1]);
<<<<<<< Updated upstream
            if(Boolean(resp)){
                message.channel.send("Removed addons for srb2kart server:\n"+resp);
=======
            if(Boolean(resp) && resp[0] && Boolean(resp[1])){
                message.channel.send("Removed addons for srb2kart server:\n"+resp[1]);
>>>>>>> Stashed changes
                if(_updateAddonsConfig()){
                    return true;
                }
                else{
                    hereLog("Error occured when updating addons after 'rm' call")
                    return false;
                }
            }
            else{
<<<<<<< Updated upstream
=======
                message.channel.send(`❌ Unable to remove${(Boolean(resp[1]))?(`:\n*\t${resp[1]}*`):"…"}`);
>>>>>>> Stashed changes
                return false;
            }
        }
    }
    else if(["list","ls","all","what","which"].includes(args[0]) || !Boolean(args[0])){
        var list= _listAddonsConfig((Boolean(args[1]))?args[1]:"");
        if(Boolean(list)){
            var resp= "Addons list for srb2kart server:\n"+list;
            var _many_resp= splitString(resp);
            if (_many_resp.length>1){
                for (var i=0; i<_many_resp.length; ++i){
                    await message.channel.send(`${_many_resp[i]}`);
                }
            }
            else{
                message.channel.send("Addons list for srb2kart server:\n"+list);
            }
            return true;
        }
        else{
            return false;
        }
    }

    return false;
}

<<<<<<< Updated upstream
=======
async function __uploading_cfg(channel, url){
    if(!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder)){
        return
    }

    if (!urlExistSync(url)){
        channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);
        return
    }

    let filename= "new_startup.cfg"
    let filepath= kart_settings.dirs.main_folder+`/${filename}`;

    var pct= 0;
    var dl_msg= await channel.send(
        `Downloading \`${filename}\` on server …\t[${pct} %]`
    );

    let _error= (msg='') => {
        if (Boolean(dl_msg)){
            dl_msg.edit(`Downloading \`${filename}\` on server …\t[ERROR!]`+
                ((Boolean(msg))?`\n\t(${msg})`:'')
            );

            dl_msg.react('❌');
        }
    }

    if(Boolean(dl_msg)){
        const file = fs.createWriteStream(filepath);
        var receivedBytes = 0;
        var totalBytes= 0;

        var t= Date.now();

        request.get(url)
            .on('response', (response) => {
                if (response.statusCode !== 200) {
                    _error('Response status was ' + response.statusCode);
                }

                totalBytes= response.headers['content-length'];
            })
            .on('data', (chunk) => {
                receivedBytes += chunk.length;

                if (Boolean(dl_msg) && (Date.now()-t>=2000)){
                    dl_msg.edit(`Downloading \`${filename}\` on server …\t[${(receivedBytes/totalBytes)*100} %]`);
                    t= Date.now();
                }
            })
            .pipe(file)
            .on('error', (err) => {
                fs.unlink(filepath, err => {
                    hereLog(`[file dl error] ${err}`)
                });
                _error();
            });

            file.on('finish', () => {
                file.close();

                if (Boolean(dl_msg)){
                    dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

                    dl_msg.react('✅');
                }

                var str= undefined
                try{
                    var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.change_config))?cmd:"false";
                    str= child_process.execSync(cmd, {timeout: 4000});
                }
                catch(err){
                    hereLog("Error while keeping addons: "+err);
                    str= undefined
                }

                if(Boolean(str)){
                    let options= (str==="updated")? {} :
                        {
                            files: [{
                                attachment: `${str}`,
                                name: `startup.cfg.diff`
                            }]
                        }
                    if(_serv_run){
                        channel.send(`\`startup.cfg\` a bien été mis à jour.\n`+
                            `Cependant, celan n'aura aucun effet pour la session déjà en cours`,
                            options
                        );
                    }
                    else{
                        channel.send(`\`startup.cfg\` a bien été mis à jour et sera effectif lors de la prochaine session.`,
                                options
                        );
                    }
                }
                else{
                    channel.send(`❌ internal error while trying to update *startup.cfg*…`);
                }
            });
        
            file.on('error', (err) => {
                fs.unlink(filepath, err => {
                    hereLog(`[file dl error] ${err}`)
                });
                _error(err.message);
            });
    }
}

async function _cmd_config(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(["get","dl","download","check"].includes(args[0])){
        var str= undefined
        try{
            var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.get_config))?cmd:"false";
            str= child_process.execSync(cmd, {timeout: 4000});
        }
        catch(err){
            hereLog("Error while keeping addons: "+err);
            str= undefined
        }

        if(Boolean(str) && fs.existsSync(str)){
            message.channel.send("Srb2kart server's startup user config file:",
                {
                    files: [{
                        attachment: `${str}`,
                        name: `startup.cfg`
                    }]
                }
            );

            return true;
        }
        else{
            message.channel.send("❌ Can't access server's config file…")
            return false;
        }
    }
    else if(["set","up","ul","upload","change"].includes(args[0])){
        if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            if(url.endsWith('.cfg')){
                await __uploading_cfg(message.channel,url);

                return true;
            }
            else{
                message.channel.send("❌ only .cfg files…");
                return false;
            }
        }
    }
    else if(["filter","forbidden","out","off","nope","bad","cfg","blacklist","cmd","deny","denies","denied"].includes(args[0])){
        var str= undefined
        try{
            var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.cfg_blacklist))?cmd:"false";
            str= child_process.execSync(cmd, {timeout: 4000});
        }
        catch(err){
            hereLog("Error while looking for cfg blacklist: "+err);
            str= undefined
        }

        if(Boolean(str)){
            message.channel.send(`Forbidden commands within *custom configuration startup script*:\n\t${str}`);
            return true;
        }
        else{
            message.channel.send("❌ server internal error");
            return false;
        }
    }

    return false;
}

>>>>>>> Stashed changes
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
                pwd= _getPassword();
<<<<<<< Updated upstream
                message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                utils.settings.set(message.guild, "serv_owner", message.member.id);
                message.channel.send(`Nouvel admin désigné du serveur SRB2Kart: ${owner}…`);
=======
                await message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                utils.settings.set(message.guild, "serv_owner", message.member.id);
                message.channel.send(`Nouvel admin désigné du serveur SRB2Kart: ${message.member.user}…`);
>>>>>>> Stashed changes

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
        else if (["addons","add-ons","addon","add-on","module","modules","mod","mods"].includes(args[0])){
            return (await _cmd_addons(cmdObj, clearanceLvl, utils))
        }
<<<<<<< Updated upstream
=======
        else if (["config","startup"].includes(args[0])){
            return (await _cmd_config(cmdObj, clearanceLvl, utils))
        }
        else if (["log","logs","log.txt"].includes(args[0])){
            var str= undefined
            try{
                var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.get_log))?cmd:"false";
                str= child_process.execSync(cmd, {timeout: 4000});
            }
            catch(err){
                hereLog("Error while looking for log.txt: "+err);
                str= undefined
            }
    
            if(Boolean(str)){
                message.channel.send(`Server's last recorded logs:`,
                    {files: [{
                        attachment: `${str}`,
                        name: `log.txt`
                    }]}
                );
                return true;
            }
            else{
                message.channel.send("❌ server internal error");
                return false;
            }            
        }
>>>>>>> Stashed changes
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
    cmdObj.msg_obj.author.send(
        "*SRB2Kart server's addons management:*\n\n"+
        "\t`!kart addons ls [pattern]`\n\n"+
        "\tList all availabe addons under three categories:\n"+
        "\t\t*[Temporary]*: addons that will removed once the current session (or next one if no server is running) is over\n"+
        "\t\t*[Downloaded]*: addons that were added manually\n"+
        "\t\t*[Base]*: addons that are loaded by default\n"+
        "\tIf `[pattern]` is given, this command will search for matching pattern amongs availabe addons.\n"+
        "\t\texample: `!kart addons ls rayman`\n\n"+
        "\t`!kart addons add [url]`\n\n"+
        "\tDownload an addon onto the server.\n\tIf `[url]` is used, the url must point directly at a file of valid extension (.pk3,.lua,.wad,.kart)"+
        " example: `https://url/bla/bla/addon.pk3`\n\tIf no url is given, the addon must be an attachment to the same message as the command, and still"+
        " have a valid addon extension (.pk3,.lua,.wad,.kart)\n"+
        "\t⚠ This addon will be added under the *[temporary]* section, meaning it will be removed after next sessions ends.\n\n"+
        "\t`!kart addons add keep [url]`\n\n"+
        "\tSame as the previous command, except that the addons will be added into the *[downloaded]* section. Meaning it wont be removed"+
        " automatically after a session ends.\n\n"+
        "\t`!kart addons keep <addon_filename>`\n\n"+
<<<<<<< Updated upstream
        "\tMove an addons from the *[temporary]* section to the *[downloaded]* section.\n\n"+
        "\t`!kart addons rm <addon_name>`\n\n"+
=======
        "\tMove an addon from the *[temporary]* section to the *[downloaded]* section.\n\n"+
        "\t`!kart addons rm <addon_filename>`\n\n"+
>>>>>>> Stashed changes
        "\tRemove the addon designated by the given name from the server.\n"+
        "\t⚠ this only works for addons under the *[downloaded]* section!"
    )
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