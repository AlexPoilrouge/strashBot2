
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;
const splitString= require('../utils').splitString;

const KartServerInfo= require('./kart/serve_info').ServerInfo_Promise;

const child_process= require("child_process");
const fs= require( 'fs' );
const path= require( 'path' );
const request = require('request');

const fetch = require('node-fetch');

const my_utils= require('../utils.js')

const os = require('os');
const ifaces = os.networkInterfaces();

const cron= require('node-cron');

const {Attachment} = require('discord.js');


let hereLog= (...args) => {console.log("[cmd_kart]", ...args);};

var kart_settings= undefined;


const KART_DEFAULT_SERV_PORT= 5029

const KARTING_LEVEL={
    NONE:               0b000,
    KART_CHANNEL:       0b001,
    KARTER:             0b010,
    KART_ADMIN:         0b100,
}



function _getKartingLevel(message, utils){
    var result= KARTING_LEVEL.NONE;
    
    var k_chan= utils.settings.get(message.guild, 'kart_channel')
    if(Boolean(k_chan) && message.channel.id===k_chan){
        result= result | KARTING_LEVEL.KART_CHANNEL
    }

    var k_role= utils.settings.get(message.guild, 'kart_role')
    if(Boolean(k_role) && message.member.roles.cache.get(k_role)){
        result= result | KARTING_LEVEL.KARTER
    }

    k_role= utils.settings.get(message.guild, 'kart_admin_role')
    if(Boolean(k_role) && message.member.roles.cache.get(k_role)){
        result= result | KARTING_LEVEL.KART_ADMIN
    }

    return result
}

function _kartingClearanceCheck(message, utils, kart_cmd=undefined, clearanceLvl=undefined, requiredLvl=KARTING_LEVEL.KART_ADMIN){
    if((!(_getKartingLevel(message, utils) & requiredLvl)) && (clearanceLvl===undefined || clearanceLvl<CLEARANCE_LEVEL.ADMIN_ROLE)){
        message.member.send(`[kart command] You don't have the clearance for `+
            `${(Boolean(kart_cmd))? `\`!kart ${kart_cmd}\`` : " that"}…`
        );
        return false;
    }
    return true
}



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

function __kartCmd(command){
    var ks= undefined, srv_cmd= undefined;
    return (Boolean(ks=kart_settings) && Boolean(command))?
                (Boolean(srv_cmd=ks.server_commands) && srv_cmd.through_ssh)?
                    Boolean(srv_cmd.server_ip) && Boolean(srv_cmd.distant_user)?
                        (`ssh ${srv_cmd.distant_user}@${srv_cmd.server_ip}`+
                            ((srv_cmd.server_port)?` -p ${srv_cmd.server_port}`:'')
                            + ` ${command}`
                        )
                    :       "false"
                :   command
            :   "false";
}

function __clearScores(user=undefined){
    if(Boolean(kart_settings.config_commands.clear_score)){
        var cmd= __kartCmd(kart_settings.config_commands.clear_score)
        try{
            str=child_process.execSync(`${cmd}${(Boolean(user))?` ${user.id}`:''}`, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog("[auto stop] error while clearing scores on autoStop: "+err.message);
            return false;
        }

        return (Boolean(str) && Boolean(str.match(/^(.*)SCORES?_CLEARED$/)))
    }
    else{
        return false;
    }
}

function _stopServer(force=false){
    var str=undefined
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.stop))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.stop)
        str=child_process.execSync(cmd+`${(force)?" FORCE":""}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog("Error while stopping server: "+err);
        return "error";
    }
    
    return (Boolean(str))?str:"ok";
}

function _startServer(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.start))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.start)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while launching server: "+err);
        b= false;
    }
    return b;
}

function _restartServer(force=false){
    str=undefined;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.restart))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.restart)
        str= child_process.execSync(cmd+`${(force)?" FORCE":""}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog("Error while restarting server: "+err);
        return "error"
    }

    return (Boolean(str))?str:"ok";
}

function _isServerRunning(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.is_active))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.is_active)
        child_process.execSync(cmd, {timeout: 16000});
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
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.init))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.init)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while initializing addons: "+err);
        b= false;
    }
    return b;
}

function _updateAddonsConfig(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.update))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.update)
        child_process.execSync(cmd, {timeout: 32000});
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
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.list))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.list)
        str= child_process.execSync(cmd+((Boolean(arg))?` ${arg}`:""), {timeout: 16000}).toString();
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
    var r=false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.remove))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.remove)
        str= child_process.execSync(cmd+` ${arg}`, {timeout: 32000}).toString();
        r=true;
    }
    catch(err){
        hereLog("Error while removing addons: "+err);
    }
    return [r,str]; 
}

function _getPassword(){
    b= false;
    stdout= undefined;
    try{
        // stdout=child_process.execSync("cat ${HOME}/.TMP_PASS", {timeout: 4000}).toString().replace('\n','');
        var cmd= __kartCmd("cat ${HOME}/.TMP_PASS");
        stdout=child_process.execSync(cmd,{timeout: 16000}).toString().replace('\n','');
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



var l_guilds= [];



function _autoStopServer(utils){
    if(_isServerRunning()){
        __clearScores()

        hereLog("[auto stop] stopping server…");
        _stopServer(true);
        
        l_guilds.forEach( (g) =>{
            utils.settings.set(g, "auto_stop", true);
            utils.settings.remove(g, 'serv_owner');
        });
    }
    else{
        hereLog("[auto stop] server already stopped…"); 
        l_guilds.forEach( (g) =>{
            utils.settings.set(guild, "auto_stop", false);
        });
    }
}

function _autoStartServer(utils){
    var didAutoStop= l_guilds.some( (g) => {
        return Boolean(utils.settings.get(g, "auto_stop"))
    });
    var serv_run= _isServerRunning();
    if(!serv_run && didAutoStop){
        hereLog("[auto start] restarting server…");
        _startServer();
    }

    l_guilds.forEach( (g) =>{
        utils.settings.set(g, "auto_stop", false);
    });

}

var _oldServInfos= undefined;

async function _checkServerStatus(utils){
    var servInfo= (await _askServInfos())
    if(Boolean(servInfo) && Boolean(servInfo.server) && servInfo.server.numberofplayer!==undefined &&
        ( !Boolean(_oldServInfos) || !Boolean(_oldServInfos.server)) ||
        ( servInfo.server.numberofplayer !== _oldServInfos.server.numberofplayer )
    ){
        var bot= utils.getBotClient();
        if(servInfo.server.numberofplayer>1){
            hereLog(`Changes in srb2kart server status detected… (player count: ${servInfo.server.numberofplayer})`);
            bot.user.setActivity('Hosting SRB2Kart Races', { type: 'PLAYING' });
        }
        else{
            hereLog(`Changes in srb2kart server status detected… (not enough player though)`);
            bot.user.setActivity('');
        }

        _oldServInfos= servInfo;
    }
    hereLog("_checkServerStatus")
}

var stop_job= undefined;
var start_job= undefined;
var status_job= undefined;

function cmd_init(utils){
    if(!Boolean(kart_settings=__loadingJSONObj("data/kart.json"))){
        hereLog("Not able to load 'kart.json' setting…");
    }
    _initAddonsConfig();

    if(!Boolean(stop_job)){
        stop_job= cron.schedule('0 4 * * *', () =>{
            hereLog("[schedule] 4 am: looking to stop srb2kart serv…");
            _autoStopServer(utils);
        });
    }

    if(!Boolean(start_job)){
        start_job= cron.schedule('0 8 * * *', () =>{
            hereLog("[schedule] 8 am: looking to start srb2kart serv…");
            _autoStartServer(utils)
        });
    }

    if(!Boolean(status_job)){
        status_job= cron.schedule('*/10 * * * *', () =>{
            _checkServerStatus(utils)
        });
    }
}


async function cmd_init_per_guild(utils, guild){
    if(Boolean(guild)) l_guilds.push(guild)

    var servOwner= utils.settings.get(guild, "serv_owner");
    var m_owner= undefined;
    if( Boolean(servOwner) &&
        (!Boolean(m_owner= await guild.members.fetch(servOwner)) || !_isServerRunning())    
    ){
        utils.settings.remove(guild, "serv_owner");
    }

    var chanKart= utils.settings.get(guild, 'kart_channel');
    var channel= undefined;
    if(!Boolean(chanKart) || !Boolean(channel= guild.channels.cache.get(chanKart))){
        if(Boolean(m_owner)){
            var chanKart= utils.settings.remove(guild, 'serv_owner');
            if(_isServerRunning()){
                _stopServer(true);
            }
        }
    }
}

async function url_availabe(url){
    return new Promise((resolve)=>{
        fetch(url, {method: 'HEAD'}).then(()=>{resolve(true)}).catch(()=>{resolve(false)})
    })
}

async function __downloading(channel, url, destDir, utils, fileName=undefined){
    var filename= (!Boolean(fileName))? url.split('/').splice(-1)[0] : fileName;


    var retries= 16
    while(retries>0 && !(await url_availabe(url))){
        --retries;
        await my_utils.sleep()
    }
    if (retries<=0){
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

    // if(!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ||
    //     (permanent && !Boolean(kart_settings.dirs.dl_dirs.permanent)) ||
    //     (!permanent && !Boolean(kart_settings.dirs.dl_dirs.temporary))
    // ){
    //     _error();

    //     return;
    // }

    if(Boolean(dl_msg)){
        // let filepath= kart_settings.dirs.main_folder+'/'+
        //     ((permanent)?kart_settings.dirs.dl_dirs.permanent:kart_settings.dirs.dl_dirs.temporary)
        //     +'/'+filename;
        let filepath= destDir+'/'+filename;
        const file = fs.createWriteStream(filepath);
        var receivedBytes = 0;
        var totalBytes= 0;

        var t= Date.now();

        let exe_p= ( async () => { return new Promise( (resolve,reject) =>{
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

                    reject(false);
                });

            file.on('finish', () => {
                file.close();

                if (Boolean(dl_msg)){
                    dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

                    dl_msg.react('✅');
                }

                resolve(true)
            });
        
            file.on('error', (err) => {
                fs.unlink(filepath, err => {
                    hereLog(`[file dl error] ${err}`)
                });
                _error(err.message);
                reject(false);
            });
        }); })

        return (await exe_p())
    }

    return false;
}

async function __ssh_download_cmd(cmd, channel, url, utils, fileName=undefined){
    hereLog(`[ssh dl] cmd: ${cmd} - url: ${url}`)
    var filename= (!Boolean(fileName))? url.split('/').splice(-1)[0] : fileName;

    
    var retries= 16
    while(retries>0 && !(await url_availabe(url))){
        --retries;
        await my_utils.sleep()
    }
    if (retries<=0){
        channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);
        return
    }
    var addr=undefined, dUser=undefined;
    if(!Boolean(addr=kart_settings.server_commands.server_ip) || !Boolean(dUser=kart_settings.server_commands.distant_user)){
        hereLog("[ssh dl] missing distant user or addr info…")
        channel.send(`❌ Internal error…`);
        return
    }

    var pct= '\t0';
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
        let exe_p= ( async () => { return new Promise( (resolve,reject) =>{
            let ssh_cmd= `ssh ${dUser}@${addr}`+
                ( (Boolean(kart_settings.server_commands.server_port))?
                    ` -p ${kart_settings.server_commands.server_port}`
                    : ``
                ) +
                ` ${cmd} ${url} ${Boolean(fileName)?fileName:''}`;
            var cmd_process= child_process.exec(ssh_cmd, {timeout:120000});

            var t= Date.now();

            cmd_process.stdout.on('data', function (data) {
                var lines= data.split('\n');
                var res=""
                if(lines.length>0){
                    res= lines[lines.length-1];
                }
                if(Boolean(res)){
                    pct=res

                    if (Boolean(dl_msg) && (Date.now()-t>=1000)){
                        dl_msg.edit(`Downloading \`${filename}\` on server …\t[${pct}]`);
                        t= Date.now();
                    }
                }
            });

            cmd_process.stderr.on('data', function (data) {
                hereLog(`[file dl error] ${data}`)
            });

            cmd_process.on('error', function (err){
                hereLog(`[file dl process error] ${err}`);

                _error();

                reject(false)
            });

            cmd_process.on('close', function (code) {
                if(code!==0){
                    hereLog(`[ssh dl] returned ${code}`);
                    _error();
                }
                else{
                    if (Boolean(dl_msg)){
                        dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

                        dl_msg.react('✅');
                    }

                    // if(_isServerRunning()){
                    //     var servOwner= utils.settings.get(channel.guild, "serv_owner");
                    //     var owner= undefined;
                    //     var str= `\`${filename}\` a bien été ajouté au serveur.\n`+
                    //         `Cependant, il ne peut être utilisé pour une session déjà en cours`;
                    //     channel.send(str+'.')         
                    // }
                    // else{
                    //     channel.send(`\`${filename}\` a bien été ajouté et sera disponible prêt à l'emploi lors de la prochaine session.`);
                    // }

                    resolve(true);
                }
            });
        }) });

        return await exe_p();
    }

    return false;
}

async function _cmd_addons(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(["try","add","get","new"].includes(args[0])){
        if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false

        let _serv_run= _isServerRunning();
        var perma= false;
        var url_rgx= /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/;
        var url= undefined;
        if(Boolean(args[1])){
            if(["keep","dl","perma","fixed","final"].includes(args[1])){
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

        if(!Boolean(url)){
            message.channel.send(`\`!kart ${sub_cmd} ${args[0]}\` needs a joined file or a url…`)
            return false
        }

        var filename= url.split('/').slice(-1)[0]

        let ext= [".pk3",".wad",".lua",".kart",".pk7"];
        var _ls="";
        if((_ls=_listAddonsConfig(url.split('/').splice(-1)[0]))!=="No result found…"){
            message.channel.send(`The following addons already exist on server:\n${_ls}`);

            return false;
        }
        else if(!Boolean(url) || !ext.some(e => {return url.endsWith(e)})){
            message.channel.send(`Seuls les fichiers addons d'extension \`${ext}\` sont acceptés…`)

            return false;
        }
        else if (!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ||
            (!_serv_run && !Boolean(kart_settings.dirs.dl_dirs.permanent)) ||
            !Boolean(kart_settings.dirs.dl_dirs.temporary)
        ){
            hereLog("[addons add] no dest directory for addon dl");
            message.channel.send(`❌ server internal error`);

            return false;
        }
        else{
            // __downloading(message.channel, url, utils, perma)
            var destDir= (_serv_run)?
                kart_settings.dirs.dl_dirs.temporary :
                kart_settings.dirs.dl_dirs.permanent;
            
            var _b=false;
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                _b= (await __ssh_download_cmd(
                        kart_settings.config_commands.addon_url,
                        message.channel, url, utils
                    ) );
            }
            else{
                _b = (await __downloading(message.channel, url, destDir, utils) );
            }

            if(!_b || !_updateAddonsConfig()){
                message.channel.send(`❌ An error as occured, can't properly add \`${filename}\` to the server addons…`);

                return false;
            }

            if(_serv_run){
                var servOwner= utils.settings.get(message.guild, "serv_owner");
                var owner= undefined;
                var str= `\`${filename}\` a bien été ajouté au serveur.\n`+
                    `Cependant, il ne peut être utilisé pour une session déjà en cours`;
                message.channel.send(str+'.')         
            }
            else{
                message.channel.send(`\`${filename}\` a bien été ajouté et sera disponible prêt à l'emploi lors de la prochaine session.`);
            }

            return true;
        }
    }
    else if(["keep","perma","fixed","final"].includes(args[0])){
        if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false

        if(Boolean(args[1])){
            var str= undefined
            var b=false;
            try{
                var cmd= __kartCmd(kart_settings.config_commands.keep);
                str= child_process.execSync(cmd+` ${args[1]}`, {timeout: 32000}).toString();
                b=true;
            }
            catch(err){
                hereLog("Error while keeping addons: "+err);
                str= undefined
            }

            if(b && Boolean(str)){
                message.channel.send(str);

                return true;
            }
            else{
                message.channel.send(`Unable to move addon *${args[1]}* to **temporary** section${(Boolean(str))?`:\n\t${str}`:"…"}`);

                return false;
            }
        }
    }
    else if(["rm","remove","del","delete","suppr"].includes(args[0])){
        if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false

        if(Boolean(args[1])){
            var resp= _removeAddonsConfig(args[1]);
            if(Boolean(resp) && resp[0] && Boolean(resp[1])){
                if(resp[1]==="SCHEDULED_FOR_REMOVAL\n"){
                    message.channel.send("Addons will be removed on server restart:\n\t"+args[1]);
                    return true
                }
                else{
                    message.channel.send("Removed addons for srb2kart server:\n"+resp[1]);
                }
                if(_updateAddonsConfig()){
                    return true;
                }
                else{
                    hereLog("[rm] Error occured when updating addons after 'rm' call")
                    return false;
                }
            }
            else{
                hereLog("[rm] got bad resp: "+resp);
                message.channel.send(`❌ Unable to remove${(Boolean(resp[1]))?(`:\n*\t${resp[1]}*`):"…"}`);
                return false;
            }
        }
    }
    else if(["list","ls","all","what","which"].includes(args[0]) || !Boolean(args[0])){
        var list= _listAddonsConfig((Boolean(args[1]))?args[1]:"");
        if(Boolean(list)){
            if(!Boolean(args[1]) && Boolean(kart_settings) && Boolean(kart_settings.http_url)){
                list+=`\n\nStrashbot addons download: ${kart_settings.http_url}/strashbot_addons.zip`
            }

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
    else if(["dl","links","link","zip","archive"]){
        if(!Boolean(args[1]) && Boolean(kart_settings) && Boolean(kart_settings.http_url)){
            message.channel.send(`You can try downloading the SRB2Kart server's addons at: ${kart_settings.http_url}/strashbot_addons.zip`);
            return true;
        }
        else{
            message.channel.send(`Addons direct download link unavailable, sorry… 😩`);
            return false;
        }
    }

    return false;
}

async function _cmd_config(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(args.length===0 || ["get","dl","download","check"].includes(args[0])){
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_config);
            str= child_process.execSync(cmd, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while keeping addons: "+err);
            str= undefined
        }

        if(Boolean(str)){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url)){
                    message.channel.send(`Srb2kart server's startup user config file: ${kart_settings.http_url}/${str}`);
                    return true;
                }
                else{
                    message.channel.send("❌ Can't access srb2kart server's config file…")
                    return false;
                }
            }
            else if(fs.existsSync(str)){
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
        else{
            message.channel.send("❌ Server internal error…")
            return false;
        }
    }
    else if(["set","up","ul","upload","change"].includes(args[0])){
        if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false

        if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
                hereLog("[cfg upload] no dest directory for cfg dl");
                message.channel.send(`❌ server internal error`);
            }
            else if(url.endsWith('.cfg')){
                // await __uploading_cfg(message.channel,url);

                var _b= false;
                if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                    _b= await __ssh_download_cmd(
                        kart_settings.config_commands.add_config_url,
                        message.channel, url, utils
                    );
                }
                else{
                    _b= await __downloading(message.channel, url,
                        kart_settings.dirs.main_folder, utils, "new_startup.cfg"
                    );
                }

                if(!_b){
                    hereLog("[uploading cfg] command fail");
                    message.channel.send(`❌ internal error preventing .cfg upload…`);
                    
                    return false;
                }

                var str= undefined
                try{
                    var cmd= __kartCmd(kart_settings.config_commands.change_config);
                    str= child_process.execSync(cmd+" new_startup.cfg", {timeout: 16000}).toString();
                }
                catch(err){
                    hereLog("Error while changing config: "+err);
                    str= undefined
                }

                if(Boolean(str)){
                    hereLog(`[change cfg] ret: ${str}`)
                    let options= (str==="updated" && !kart_settings.server_commands.through_ssh)?
                        {
                            files: [{
                                attachment: `${str}`,
                                name: `startup.cfg.diff`
                            }]
                        } : {}
                    if(_isServerRunning()){
                        message.channel.send(`\`startup.cfg\` a bien été mis à jour.\n`+
                            `Cependant, cela n'aura aucun effet pour la session déjà en cours\n` +
                            ( (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/startup.cfg.diff`
                                : "Diff generated file" ),
                            options
                        );
                    }
                    else{
                        message.channel.send(
                            ( (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/startup.cfg.diff`
                                : "Diff generated file" ),
                            options
                        );
                    }
                }
                else{
                    message.channel.send(`❌ internal error while trying to update *startup.cfg*…`);
                }

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
            var cmd= __kartCmd(kart_settings.config_commands.cfg_blacklist);
            str= child_process.execSync(cmd, {timeout: 16000}).toString();
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

async function _cmd_addon_load(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(args.length===0 || ["get","dl","download","check"].includes(args[0])){
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_addon_load_config);
            str= child_process.execSync(cmd, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while looking for addons order file: "+err);
            str= undefined
        }

        if(Boolean(str)){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url)){
                    message.channel.send(`Srb2kart server's addons load order config file: ${kart_settings.http_url}/${str}`);
                    return true;
                }
                else{
                    message.channel.send("❌ Can't access srb2kart server's addons load order config file…")
                    return false;
                }
            }
            else if(fs.existsSync(str)){
                message.channel.send("Srb2kart server's addons load order config file:",
                    {
                        files: [{
                            attachment: `${str}`,
                            name: `addon_load_order.txt`
                        }]
                    }
                );

                return true;
            }
            else{
                message.channel.send("❌ Can't access server's addons load order config file…")
                return false;
            }
        }
        else{
            message.channel.send("❌ Server internal error…")
            return false;
        }
    }
    else if(["set","up","ul","upload","change"].includes(args[0])){
        if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false

        if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
                hereLog("[upload] no dest directory for addon order config dl");
                message.channel.send(`❌ server internal error`);
            }
            else{
                // await __uploading_cfg(message.channel,url);

                var _b= false;
                if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                    _b= await __ssh_download_cmd(
                        kart_settings.config_commands.add_addon_order_config_url,
                        message.channel, url, utils
                    );
                }
                else{
                    _b= await __downloading(message.channel, url,
                        kart_settings.dirs.main_folder, utils, "new_addon_load_order.txt"
                    );
                }

                if(!_b){
                    hereLog("[uploading load order config] command fail");
                    message.channel.send(`❌ internal error preventing addon order config upload…`);
                    
                    return false;
                }

                var str= undefined
                try{
                    var cmd= __kartCmd(kart_settings.config_commands.change_addon_order_config);
                    str= child_process.execSync(cmd+" new_addon_load_order.txt", {timeout: 16000}).toString();
                }
                catch(err){
                    hereLog("Error while changing addon order config: "+err);
                    str= undefined
                }

                if(Boolean(str)){
                    hereLog(`[change cfg] ret: ${str}`)
                    let options= (str==="updated" && !kart_settings.server_commands.through_ssh)?
                        {
                            files: [{
                                attachment: `${str}`,
                                name: `addon_load_order.txt.diff`
                            }]
                        } : {}
                    if(_isServerRunning()){
                        message.channel.send(`\`addon_load_order.txt\` a bien été mis à jour.\n`+
                            `Cependant, cela n'aura aucun effet pour la session déjà en cours\n` +
                            ( (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/addon_load_order.txt.diff`
                                : "Diff generated file" ),
                            options
                        );
                    }
                    else{
                        message.channel.send(
                            ( (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/addon_load_order.txtdiff`
                                : "Diff generated file" ),
                            options
                        );
                    }
                }
                else{
                    message.channel.send(`❌ internal error while trying to update *addon_load_order.txt.cfg*…`);
                }

                return true;
            }
        }
    }

    return false;
}

async function ___stringFromID(guild, id){
    var member= undefined;
    try{
        member= await guild.members.fetch(id)
    }
    catch(err){
        hereLog(`[StringFromID] Error while searching member '${id}' in guild ${guild}…`);
        member= undefined
    }

    if(Boolean(member)){
        if(Boolean(member.nickname)){
            return member.nickname;
        }
        else{
            return member.user.username;
        }
    }
    else return "Unknown";
}

async function __replaceIDinString(guild, string){
    var ret= string
    var match= undefined;
    var id= undefined;
    var name= "unknown";
    if( Boolean(match=(string.match("([0-9]{18})"))) && match.length>1
            && Boolean(id=match[1]) && Boolean(name=(await ___stringFromID(guild, id))) )
    {
        ret=ret.split(id).join(`*${name}*`);
    }

    return ret;
}

// async function __uploading_lmp(channel,url,id){
//     if(!Boolean(kart_settings) || !Boolean(kart_settings.config_commands.add_times)){
//         channel.send(`❌ Internal error while trying to add lmp record…`);

//         return false
//     }

//     if (!urlExistSync(url)){
//         channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);

//         return false
//     }

//     let filename= `${id}.lmp`
//     let filepath= kart_settings.dirs.main_folder+`/${filename}`;

//     var pct= 0;
//     var dl_msg= await channel.send(
//         `Downloading \`${filename}\` on server …\t[${pct} %]`
//     );

//     let _error= (msg='') => {
//         if (Boolean(dl_msg)){
//             dl_msg.edit(`Downloading \`${filename}\` on server …\t[ERROR!]`+
//                 ((Boolean(msg))?`\n\t(${msg})`:'')
//             );

//             dl_msg.react('❌');
//         }
//     }

//     if(Boolean(dl_msg)){
//         const file = fs.createWriteStream(filepath);
//         var receivedBytes = 0;
//         var totalBytes= 0;

//         var t= Date.now();

//         request.get(url)
//             .on('response', (response) => {
//                 if (response.statusCode !== 200) {
//                     _error('Response status was ' + response.statusCode);
//                 }

//                 totalBytes= response.headers['content-length'];
//             })
//             .on('data', (chunk) => {
//                 receivedBytes += chunk.length;

//                 if (Boolean(dl_msg) && (Date.now()-t>=2000)){
//                     dl_msg.edit(`Downloading \`${filename}\` on server …\t[${(receivedBytes/totalBytes)*100} %]`);
//                     t= Date.now();
//                 }
//             })
//             .pipe(file)
//             .on('error', (err) => {
//                 fs.unlink(filepath, err => {
//                     hereLog(`[file dl error] ${err}`)
//                 });
//                 _error();
//             });

//             file.on('finish', () => {
//                 file.close();

//                 if (Boolean(dl_msg)){
//                     dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

//                     dl_msg.react('✅');
//                 }

//                 var str= undefined
//                 try{
//                     var cmd= __kartCmd(kart_settings.config_commands.add_times);
//                     str= child_process.execSync(cmd+` ${filepath} ${id}`, {timeout: 4000}).toString();
//                 }
//                 catch(err){
//                     hereLog("Error while adding time: "+err);
//                     str= undefined
//                 }

//                 var _f_str= str
//                 if(Boolean(str) && ( ( (typeof(str)==='string') && str.startsWith("ADDED")) || (str=str.toString()).startsWith("ADDED") ) ){
//                     channel.send( _f_str );
//                 }
//                 else{
//                     channel.send(`❌ internal error while trying to add recorded time [${str}]`);
//                 }
//             });
        
//             file.on('error', (err) => {
//                 fs.unlink(filepath, err => {
//                     hereLog(`[file dl error] ${err}`)
//                 });
//                 _error(err.message);
//             });
//     }
// }

async function _cmd_timetrial(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    const _base_cmd= async (mapName=undefined)=>{
        var cmd= __kartCmd(kart_settings.config_commands.map_times);

        if(!Boolean(mapName)){
            var str= undefined
            try{
                str= child_process.execSync(cmd, {timeout: 32000}).toString();
            }
            catch(err){
                hereLog("Error while fetchin map times: "+err);
                str= undefined
            }

            if(!Boolean(str) || str.length===0){
                message.channel.send(`❌ no time data found…`);
                return true;
            }

            var lines= str.split('\n');
            var sendings= [];
            var msg="";
            for (var i=0; i< lines.length; ++i){
                var l= (await __replaceIDinString(message.guild, lines[i]))+'\n';
                if ((msg.length+l.length)>1995){
                    sendings.push(msg)
                    msg=l;
                }
                else{
                    msg+=l;
                }
            }

            for(var i=0; i<sendings.length; ++i){
                message.channel.send(sendings[i]);
            }
            if(msg.length>0) message.channel.send(msg);

            return true;
        }
        else{
            var str= undefined
            try{
                str= child_process.execSync(cmd+` ${mapName}`, {timeout: 32000}).toString();
            }
            catch(err){
                hereLog("Error while fetchin map times: "+err);
                str= undefined
            }

            if(!Boolean(str)){
                message.channel.send(`❌ no time data found…`);
                return false;
            }

            var msg= `On **${mapName}**:\n`;
            var lines= str.split('\n');
            
            const readMapTimes= async (lines) =>{
                var name="unknown"
                var time="59'59'99"
                var by= "unknown"
                var wth= "character"
                var stats= "unknown stats"
                var files= '0 files'

                var ret=""
                for(var i=0; i<lines.length; ++i){
                    //hereLog(`\t[base_cmd]i= ${i}`)
                    switch (i%9){
                    case 0:
                    {
                        //hereLog(`\t[base_cmd]case 0`)
                        name="unknown"
                        time="59'59'99"
                        by= "unknown"
                        wth= "character"
                        stats= "unknown stats"
                        files= '0 files'
                    }
                    break;
                    case 2:
                    {
                        name= await __replaceIDinString(message.guild, lines[i]);
                    }
                    break;
                    case 3:
                    {
                        time= lines[i]
                    }
                    break;
                    case 4:
                    {
                        by= lines[i]
                    }
                    break;
                    case 5:
                    {
                        wth= lines[i]
                    }
                    break;
                    case 6:
                    {
                        var s_w= lines[i].split(' ');
                        stats=`speed: ${s_w[0]}; weight: ${s_w[1]}`
                    }
                    break;
                    case 8:
                    {
                        var _r= undefined
                        var n_files= undefined
                        if(Boolean(_r=(lines[i].match(/^\[ ([0-9]*) \]+.*/))) && Boolean(n_files=parseInt(_r[1]))){
                            files= `${n_files} files: ${lines[i].substring(_r[1].length+4,200)+((lines[i].length>=100)?"…":"")}`
                        }

                        ret+= `\`${time}\` by ${by} (from ${name}) with ${wth} (${stats})\n`
                        ret+= `\t\t${files}\n`
                    }
                    }
                }

                ret=(ret.length>1900)?(ret.substring(0,1900)+"\n[…]"):ret;

                return ret;
            }

            msg+= (await readMapTimes(lines));

            if(Boolean(msg)){
                message.channel.send(msg);

                return true;
            }
        }

        return false;
    }

    if(args.length===0){
        return (await _base_cmd())
    }
    else if(["add","a","upload","ul","new","n","record","r"].includes(args[0])){
        if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
                hereLog("[lmp upload] no dest directory for lmp dl");
                message.channel.send(`❌ server internal error`);
            }
            else if(url.endsWith('.lmp')){
                // await __uploading_lmp(message.channel,url,message.author.id);
                var _b= false;
                if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                    _b= await __ssh_download_cmd(
                        kart_settings.config_commands.add_times_url,
                        message.channel, url, utils, `${message.author.id}.lmp`
                    );
                }
                else{
                    _b= await __downloading(message.channel, url,
                        kart_settings.dirs.main_folder, utils,
                        `${message.author.id}.lmp`
                    );
                }

                if(!_b){
                    hereLog("[uploading lmp] command fail");
                    message.channel.send(`❌ internal error preventing .lmp upload…`);
                    
                    return false;
                }

                let filepath= kart_settings.dirs.main_folder+`/${message.author.id}.lmp`;
                var str= undefined
                try{
                    var cmd= __kartCmd(kart_settings.config_commands.add_times);
                    str= child_process.execSync(cmd+` ${filepath} ${message.author.id}`, {timeout: 32000}).toString();
                }
                catch(err){
                    hereLog("Error while adding time: "+err);
                    str= undefined
                }

                var _f_str= str
                if(Boolean(str) && ( ( (typeof(str)==='string') && str.startsWith("ADDED")) || (str=str.toString()).startsWith("ADDED") ) ){
                    message.channel.send( _f_str );
                }
                else{
                    message.channel.send(`❌ internal error while trying to add recorded time [${str}]`);

                    return false;
                }

                return true;
            }
            else{
                message.channel.send("❌ only .lmp files…");
                return false;
            }
        }
        
    }
    else if(["get","download","dl","challenge"].includes(args[0])){
        if(args.length<=1){
            return false;
        }

        var mapname= args.slice(1).join(' ');
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_times);
            str= child_process.execSync(cmd+` ${mapname}`, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while fetching time: "+err);
            str= undefined
        }

        if(!Boolean(str)){
            message.channel.send( "❌ couldn't find or access requested time record…"
                                +((Boolean(str))?` (${str})`:'') );

            return false;
        }

        match= str.match(/ZIPPED - (\/?((.+)\/)*.+)/)
        var path= undefined;
        if(Boolean(match) && Boolean(path=match[1])){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url) ){
                    message.channel.send(`"Submitted time for **${mapname}**: ${kart_settings.http_url}/${path}`)
                    
                    return true;
                }
                else{
                    message.channel.send("❌ couldn't find or access requested time record on srb2kart server…");

                    return false;
                }
            }
            else if(Boolean(path=match[1]) && fs.existsSync(path)){
                message.channel.send(`"Submitted time for **${mapname}**:`,
                    {
                        files: [{
                            attachment: `${path}`
                        }]
                    }
                );

                return true;
            }
            else{
                message.channel.send("❌ couldn't find or access requested time record…");
    
                return false;
            }
        }
        else{
            message.channel.send("❌ couldn't find or access requested time record…");

            return false;
        }

    }
    else if(["remove","rm","delete","d"].includes(args[0])){
        if(args.length<=1){
            return false;
        }

        var mapname= args.slice(1).join(' ');
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.remove_times);
            str= child_process.execSync(cmd+` ${message.author.id} ${mapname}`, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while removing time: "+err);
            str= undefined
        }

        if(!Boolean(str) || !Boolean(str.startsWith("RECORD_REMOVED"))){
            message.channel.send( "❌ couldn't find or remove designated time record…"
                                +((Boolean(str))?` (${str})`:'') );

            return false;
        }
        else{
            message.channel.send(`Your time record has been removed on map *“${mapname}”*`)
            return true;
        }


    }
    else{
        return (await _base_cmd(args.join(' ')));
    }

    return false;
}

async function _cmd_register(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(args[0]==='new'){
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.register);
            str= child_process.execSync(`${cmd} ${message.author.id}`, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog(`[cmd_register][new] Error while registering user ${message.author}…\n\t${err}`);
            str= undefined
        }

        if(Boolean(str) && Boolean(["NEW_MEMBER","CHANGE_MEMBER"].find(e=>{return str.startsWith(e);}))){
            let _t= str.replace(/\n/g,'').split(' ')
            let token= _t[1]
            let welcome= _t[2].split(':')

            let dirPath= __dirname+`/data/${message.author.id}`;
            if(!fs.existsSync(dirPath)){
                fs.mkdirSync(dirPath,{recursive: true});
            }
            let welcomeFilePath= `${dirPath}/strashbot_welcome.cfg`
            let tokenFilePath= `${dirPath}/strashbot_token_${welcome[1]}.cfg`

            var b_success= true
            fs.writeFileSync(welcomeFilePath, `strashBot_welcome ${welcome[0]}`, (err)=>{
                if(err){
                    hereLog(`[cmd_register][new] couldn't write file '${welcomeFilePath}':\n\t${err.message}`)
                    b_success= false
                }
            })
            fs.writeFileSync(tokenFilePath, `strashBot_submitToken ${token}`, (err)=>{
                if(err){
                    hereLog(`[cmd_register][new] couldn't write file '${welcomeFilePath}':\n\t${err.message}`)
                    b_success= false
                }
            })
            if(b_success){
                let r= false
                try{
                    r= ( await ( new Promise( (resolve, reject) => { message.author.send(
                            `[${message.guild.name}] Enregisterment aupès du serveur SRB2Kart réussi!\n`+
                            `Téléchargez et placez ces 2 fichiers à la racine de votre dossier d'installation srb2kart.`,
                            {   files: [welcomeFilePath, tokenFilePath],
                                split: true
                            }
                        ).catch(err=>{
                            resolve(false);
                        }).finally(()=>{
                            fs.unlink(welcomeFilePath, (err)=>{
                                if(err){
                                    hereLog(`[cmd_register][new] error while getting rid of file ${welcomeFilePath}:\n\t${err.message}`)
                                }
                            })
                            fs.unlink(tokenFilePath, (err)=>{
                                if(err){
                                    hereLog(`[cmd_register][new] error while getting rid of file ${welcomeFilePath}:\n\t${err.message}`)
                                }
                            })
                            fs.rmdir(dirPath, {recursive: true}, (err)=>{
                                if(err){
                                    hereLog(`[cmd_register][new] error while getting rid of directory ${dirPath}:\n\t${err.message}`)
                                }
                            })
                            resolve(true);
                        })
                    } ) ) )
                } catch(err){
                    if(err){
                        hereLog(`[cmd_register][new]error during registeration of ${message.author}:\n\t${err.message}`)
                        r= false;
                    }
                }
                return r;
            }
            else{
                message.author.send(`[${message.guild.name}] command \`!${sub_cmd} new\` failed: internal error`)
                return false;
            }
        }
    }
    else{
        var r= (Boolean(message.mentions.roles) && Boolean(r=message.mentions.users.first()))?
                    r
                :   message.author;

        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.is_registered);
            str= child_process.execSync(`${cmd} ${r.id}`, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog(`Error while registering user ${message.author}…\n\t${err}`);
            str= undefined
        }

        if(!Boolean(str)){
            message.channel.send("❌ Internal error…")
            return false
        }

        message.channel.send(
            (str.startsWith("REGISTERED"))?
                `✅ User ${r} is registered!`
            :   `❌ User ${r} not registered…`
        )

        return true;
    }
}

async function _askServInfos(){
    if(!Boolean(kart_settings) || !Boolean(kart_settings.server_commands)
        || !Boolean(kart_settings.server_commands.server_ip)
        || (kart_settings.server_commands.server_ip.length<=0)
    ){
        hereLog(`[askServInfos] bad config…`);
        return undefined;
    }

    var r= undefined
    try{
        var addr= kart_settings.server_commands.server_ip
        var port= kart_settings.server_commands.server_port
        port= ((!Boolean(port)) || (port.length<=0))?
            KART_DEFAULT_SERV_PORT : port
        r= (await KartServerInfo(addr, port, 16000))
    }
    catch(err){
        hereLog(`[askServInfos] couldn't get server info at `
            +`${addr}:${port} - ${err}`)
        r= undefined
    }

    return r
}

function _getServMode(){
    if(!Boolean(kart_settings) || !Boolean(kart_settings.config_commands)
        || !Boolean(kart_settings.config_commands.serv_info)
    ){
        hereLog(`[getInfos] bad config…`);
        return undefined;
    }

    var str= undefined
    try{
        var cmd= __kartCmd(kart_settings.config_commands.serv_info);
        str= child_process.execSync(cmd, {timeout: 5000}).toString();
    }
    catch(err){
        hereLog("[getInfos] Error while looking for server infos: "+err);
        str= undefined
    }

    if(!Boolean(str)) return undefined

    var obj= undefined
    try{
        obj= JSON.parse(str)
    } catch(err){
        hereLog(`[setServMode] couldn't get server mode info:\n\t${err}`)
        obj= undefined
    }
    if(!Boolean(obj)) return undefined

    if(!Boolean(obj.modes)){
        hereLog(`[setServMode] No mode info recieved from \'${kart_settings.config_commands.serv_info}\'`)
        return undefined
    }
    var t= obj.modes.map(m => {
        var b= false
        var s= (b=m.startsWith('*'))?m.substr(1):m
        var c= b?'*':''
        switch(s){
            case "FRIEND":
                return `${c}FriendMod`
            case "SPBATK":
                return `${c}SPB Attack`
            case "ELIM":
                return `${c}Elimination`
            case "JUICEBOX":
                return `${c}JuiceBox`
            case "ACRO":
                return `${c}Acrobatics`
            case "HP":
                return `${c}HP`
            default:
                return `${c}${s}`
        }
    })

    return t
}

async function _cmd_clip(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    var cmd= null;
    var cmdType= 0
    let msg_url_rgx= /^<?(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+>?$/;

    var __url_clean= (url) =>{
        return url.replace(/^<+/,'').replace(/>+$/,'')
    }

    var __description_clean= ( async (txt, guild) =>{
        var rx_customEmoji= /<:(.+?):\d+>/g
        var rx_channelMention_id= /<#(\d+)>/g
        var rx_userMention_id= /<@(\d+)>/g
        var rx_groupMention_id= /<@&(\d+)>/g

        var r= txt.replace('"','').replace('\\','').slice(0,250).replace(rx_customEmoji, "$1")

        var ___name_lookups={
            "members": (x) =>{
                var n= null
                return (Boolean(n=x.nickname))? n : x.user.name;
            },
            "*": (x) => {return x.name;}
        }

        var ___process_discord_objs= (async (txt, regex, guild_attr) => {
            var res= txt
            var tmp= null
            if (Boolean(tmp=r.match(regex))){
                var replace_table= []
                for (var pattern in tmp){
                    var m_id= null, id= null, name= null
                    if(Boolean(m_id=pattern.match(/\d+/)) && Boolean(id=m_id[0])){
                        await guild[guild_attr].fetch(id).then(obj =>{
                            name= ___name_lookups(guild_attr)
                        }).catch(err =>{
                            hereLog(`[clip][decription processing] error trying to fetch name of '${pattern}' - ${err}`)
                        })
                    }
                    name= (Boolean(name) && name.length>0)?name:"-unknown-"

                    replace_table.push([pattern, name])
                }
                for (var replacement in replace_table){
                    res= res.replace(replacement[0],replacement[1])
                }
            }

            return res
        })

        r= (await ___process_discord_objs(r, rx_channelMention_id, "channels"))
        r= (await ___process_discord_objs(r, rx_userMention_id, "members"))
        r= (await ___process_discord_objs(r, rx_groupMention_id, "groups"))

        return r
    })

    var __add_clip_cmd = (async (arg_start_idx, url) => {
        cmdType= 1
        cmd= `${__kartCmd(kart_settings.config_commands.clip_add)} "${url}" "${message.author.id}"`

        if(args.length>arg_start_idx){
            var desc= (await __description_clean(args.slice(arg_start_idx).join(' ')));
            cmd+= ` "\\\"${desc}\\\""`
        }
    })

    if(args.length>0){
        if(args[0].toLowerCase()==="info"){
            cmdType= 3
            cmd= `${__kartCmd(kart_settings.config_commands.clip_info)}`
            if(args.length<2){
                message.author.send(`[${message.guild}] command \`!kart ${sub_cmd}\` needs a "clipID" as argument`)
                return false
            }
            cmd+= ` "${args[1]}"`
        }
        else if(["rm","del","delete","remove","delete"].includes(args[0].toLowerCase())){
            cmdType= 2
            cmd= `${__kartCmd(kart_settings.config_commands.clip_remove)}`
            if(args.length<2){
                message.author.send(`[${message.guild}] command \`!${sub_cmd}\` needs a "clipID" as argument`)
                return false
            }
            cmd+= ` "${args[1]}" "${(clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE)?'ADMIN':message.author.id}"`
        }
        else if(["out","outdated","old","bad","unavailable","miss","missing","discarded"].includes(args[0].toLowerCase())){
            cmdType= 4
            cmd= `${__kartCmd(kart_settings.config_commands.outdated_clips)}`
        }
        else if(["edit","desc","description","text"].includes(args[0].toLowerCase())){
            cmdType= 5
            cmd= `${__kartCmd(kart_settings.config_commands.clip_edit_description)}`
            if(args.length<2){
                message.author.send(`[${message.guild}] command \`!${sub_cmd}\` needs a "clipID" as argument`)
                return false
            }
            cmd+= ` "${args[1]}" "${(clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE)?'ADMIN':message.author.id}"`
            if(args.length>=3){
                var desc= (await __description_clean(args.slice(2).join(' ')));
                cmd+= ` "\\\"${desc}\\\""`
            }
        }
        else if(Boolean(args[0].match(msg_url_rgx))){
            await __add_clip_cmd(1, __url_clean(args[0]))
        }
        else if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            await __add_clip_cmd(((args[0]==="add")?1:0), __url_clean(url))
        }
    }
    else if(Boolean(message.attachments) && message.attachments.size>=1){
        var url= message.attachments.first().url;
        
        await __add_clip_cmd(0,  __url_clean(url))
    }

    if (!Boolean(cmd)){
        hereLog(`[clips] Bad command: \`${args.join(' ')}\``)
        return false;
    }

    var str= undefined
    try{
        str= child_process.execSync(cmd, {timeout: 16000}).toString().replace(/\n+$/, '');
    }
    catch(err){
        hereLog("[clips] Error while using command - "+err);
        str= undefined
    }


    if(Boolean(str) && str.length>0){
        res= str.split(' - ')
        if(res[0]==="BAD_TYPE"){
            var resp= `**Unsupported type**: only supports direct \`.gif\`, \'.webm\', \'.ogg\' or \'.mp4\' urls or uploads,\n`+
                `*YouTube* video links or *streamable.com* video links.`;
            message.channel.send(resp, {split: true})
            return false;
        }
        else if(res[0]==="ALREADY_ADDED"){
            var resp= `**Clip url already in database**: the url seems to be already present in database`+
                `${(res.length>2 && res[2])?` under clip id \`${res[2]}\`…`:'…'}`
            message.channel.send(resp, {split: true})
            return false;
            
        }
        else if(res[0]==="CLIP_ADDED"){
            return true
        }
        else if(res[0]==="BAD_USER_ID"){
            var resp= `**No access**: you can't remove or edit a clip that doesn't belong to you…`
            message.channel.send(resp, {split: true})
            return false;
        }
        else if(res[0]==="CLIP_NOT_FOUND"){
            var resp= `**Clip not found**: No clip was found under this id…`
            message.channel.send(resp, {split: true})
            return false;
        }
        else if(res[0]==="CLIP_REMOVED"){
            return true;
        }
        else if(res[0]==="CLIPS_CHECKED"){
            return true;
        }
        else if(res[0]==="CLIP_INFO"){
            var resp= `**Clip id**: ${res[1]}\n\t**url**: <${res[2]}>${(res[6]==="OUTDATED")?"(⚠ unreachable)":""}\n`+
                    `\t**type**: ${res[3]}\n\t**date**: ${res[4]}`;

            if(Boolean(res[5])){
                var sender= null
                await message.guild.members.fetch(res[5]).then(m =>{
                    sender= (Boolean(m.nickname) && m.nickname.length>0)?m.nickname:m.user.username
                }).catch(err =>{
                    hereLog(`[clip info] couldn't find user ${res[5]} on this guild ${message.guild}: ${err}`)
                    sender= '~~unknown~~'
                })
                if(Boolean(sender) && sender.length>0){
                    resp+= `\n\t*Referenced by:* ${sender}`
                }
            }

            message.channel.send(resp)

            return true
        }
        else if(res[0]==="OUTDATED_CLIPS"){
            if(res.length>2){
                var resp= `${res[1]} outdated clips!\n`
                var data= null
                try{
                    data= JSON.parse(res[2])
                }
                catch (err){
                    hereLog(`[clip][outdated_clips] couldn't read outdated clip from JSON response`)
                    data= null
                }

                if(Boolean(data)){
                    for (id in data){
                        var obj= data[id]
                        resp+= `**clip ${id}**: <${obj['url']}> [${obj['timestamp']}]\n`
                    }

                    message.channel.send(resp)

                    return true
                }
                else{
                    hereLog(`[clip][outdated_clips] bad response: ${str}`)
                    message.author.send(`[*${message.guild}*] \`!kart clip\`: internal error while fetching info from database`)
                    return false
                }
            }
            else{
                hereLog(`[clip][outdated_clips] bad response: ${str}`)
                message.author.send(`[*${message.guild}*] \`!kart clip\`: internal error while fetching info from database`)
                return false
            }

        }
        else if(res[0]==="UNEXPECTED_RESULT"){
            hereLog(`[clip] bad response: ${str}`)
            message.author.send(`[*${message.guild}*] \`!kart clip\`: internal error while fetching info from database`)
            return false
        }
        else if(res[0]==="DESCRIPTION_UPDATED"){
            return true;
        }
        else if(res[0]==="ERROR"){
            hereLog(`[clip] bad response: ${str}`)
            message.author.send(`[*${message.guild}*] \`!kart clip\`: internal error`)
            return false
        }
        else if(res[0]==="UNKOWN_ERROR"){
            hereLog(`[clip] bad response: ${str}`)
            message.author.send(`[*${message.guild}*] \`!kart clip\`: unknown internal error`)
            return false
        }
        else if(res[0]==="UNKOWN_RESULT"){
            hereLog(`[clip] bad response: ${str}`)
            message.author.send(`[*${message.guild}*] \`!kart clip\`: unknown response from server`)
            return false
        }
        else{
            hereLog(`[clip] bad response: ${str}`)
            message.author.send(`[*${message.guild}*] \`!kart clip\`: unknown response from server`)
            return false            
        }
    }
    else{
        hereLog(`[clips] bad command result… (${str})`);
        message.author.send(`[*${message.guild}*] \`!kart clip\`: internal error, bad response`)
        return false;
    }
}

async function cmd_main(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let args= cmdObj.args;
    if(args[0]==="role" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        if(args[1]==="clear"){
            utils.settings.remove(message.guild, 'kart_role');

            return true
        }
        else if(args[1]==="which"){
            var roleKart= utils.settings.get(message.guild, 'kart_role');
            var role= undefined;
            if(!Boolean(roleKart) || !Boolean(role=message.guild.roles.cache.get(roleKart))){
                message.author.send("No role set as *karting main role*…");

                return true;
            }
            else {
                message.author.send(`Role \"${role.name}\" is set as the *karting main role*…`);

                return true;
            }
        }
        var role= undefined;
        if(!Boolean(message.mentions) || !Boolean(message.mentions.roles) || !Boolean(role=message.mentions.roles.first())){
            message.member.send("[kart command] No mention to any role found… Format is:\n\t`!kart role @rolemention`");

            return false;
        }

        utils.settings.set(message.guild, 'kart_role', role.id);

        return true;
    }
    else if(args[0]==="admin_role" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        if(args[1]==="clear"){
            utils.settings.remove(message.guild, 'kart_admin_role');

            return true
        }
        else if(args[1]==="which"){
            var roleKart= utils.settings.get(message.guild, 'kart_admin_role');
            var role= undefined;
            if(!Boolean(roleKart) || !Boolean(role=message.guild.roles.cache.get(roleKart))){
                message.author.send("No role set as *karting admin role*…");

                return true;
            }
            else{
                message.author.send(`Role \"${role.name}\" is set as the *karting admin role*…`);

                return true;
            }
        }
        var role= undefined;
        if(!Boolean(message.mentions) || !Boolean(message.mentions.roles) || !Boolean(role=message.mentions.roles.first())){
            message.member.send("[kart command] No mention to any role found… Format is:\n\t`!kart admin_role @rolemention`");

            return false;
        }

        utils.settings.set(message.guild, 'kart_admin_role', role.id);

        return true;
    }
    else if(args[0]==="channel" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        if(args[1]==="clear"){
            utils.settings.remove(message.guild, 'kart_channel');

            if(_isServerRunning()){
                _stopServer(true);
            }

            return true;
        }
        else if(args[1]==="which"){
            var chanKart= utils.settings.get(message.guild, 'kart_channel');
            var channel= undefined;
            if(!Boolean(chanKart) || !Boolean(channel=message.guild.channels.cache.get(chanKart))){
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
            message.member.send("[kart command] No mention to any channel found… Format is:\n\t`!kart channel #channelmention`");

            return false;
        }

        utils.settings.set(message.guild, 'kart_channel', channel.id);

        return true;

    }
    else{
        // var chanKart= utils.settings.get(message.guild, 'kart_channel');
        // if(!Boolean(chanKart) || chanKart!==message.channel.id){
        //     message.member.send(`[kart command] command \`!kart ${args[0]}\` only possible in dedicated kart channel…`);
        //     return false;
        // }
        if((!(_getKartingLevel(message, utils) & KARTING_LEVEL.KART_CHANNEL))){
            message.member.send(`[kart command] command \`!kart ${args[0]}\` only possible in dedicated kart channel…`);
            return false;
        }

        if(["run","launch","start","go","vroum"].includes(args[0])){
            if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false

            if(_isServerRunning()){
                str="Server SRB2Kart is already running…";

                var servOwner= utils.settings.get(message.guild, "serv_owner");
                var owner= undefined;
                if(!Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().users.fetch(servOwner))){
                    str+=`\n\t⚠ No SRB2Kart server owner set. (use \`!kart claim\` to take admin privileges)`;
                }
                else{
                    str+=`\n\t*Server owner is ${owner}*`;
                }
                message.channel.send(str);
            }
            else{
                var success= _startServer();

                if(!success){
                    _stopServer(true);
                    message.member.send(`[kart command] unable to start SRB2Kart server…`);

                    return false;
                }

                if( args.length>1 && ["lone","void","stand","alone","free","standalone"].includes(args[1])){
                    message.channel.send("Strashbot srb2kart server started…\n"+
                        "\t⚠ No SRB2Kart server owner set. (use \`!kart claim\` to take admin privileges)"
                    );
                }
                else{
                    pwd= _getPassword();
                    utils.settings.set(message.guild, "serv_owner", message.member.id);
                    message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                    message.channel.send("Strashbot srb2kart server started…");
                }

                return true;
            }
        }
        else if(["halt","quit","stop","nope","kill","shutdown","done"].includes(args[0])){
            if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (!Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().users.fetch(servOwner))) ||
                ((clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) || (owner.id===message.author.id))
            ){
                res= _stopServer( args.length>1 && args[1]==="force" );
                if(res!=="error"){
                    if(res==="populated"){
                        message.channel.send("There might be some players remaining on Strashbot srb2kart server…\n"+
                            "Are you sure you want to stop the server?\n"+
                            `If so use: \`!kart stop force\``
                        );
                        return false;
                    }
                    else{
                        message.channel.send("Strashbot srb2kart server stopped…");
                        utils.settings.remove(message.guild, "serv_owner");
                        return true;
                    }
                }
                else{
                    message.channel.send("Error while trying to stop server… 😰");
                    return false;
                }
            }
            else{
                message.channel.send("Seule la personne qui a lancé le serveur SRB2Kart peut le stopper…");
                return false;
            }
        }
        else if(["restart","retry","re","again","relaunch"].includes(args[0])){
            if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (!Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().users.fetch(servOwner))) ||
                ((clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) || (owner.id===message.author.id))
            ){
                var b_force= ( args.length>1 && args.includes("force"));
                var res= _restartServer(b_force);
                if(res==="error"){
                    var str="Error while restarting server…"
                    if (_isServerRunning()){
                        str+="\n\tServer seems to remain active…";
                    }
                    else{
                        str+="\n\tServer seems stopped… ";
                        utils.settings.remove(message.guild, "serv_owner");
                    }
                    message.channel.send(str);
                    return false;
                }
                else{
                    var b_stand= ( args.length>1 &&
                        args.some((a) => {return ["lone","void","stand","alone","free","standalone"].includes(a)}) 
                    );

                    if(res==="populated"){
                        message.channel.send("There might be some players remaining on Strashbot srb2kart server…\n"+
                            "Are you sure you want to restart the server?\n"+
                            `If so use: \`!kart restart ${(b_stand)?"stand ":""}force\``
                        );
                        return false;
                    }

                    if( b_stand ){
                        message.channel.send("Strashbot srb2kart server restarted…\n"+
                            "\t⚠ No SRB2Kart server owner set. (use \`!kart claim\` to take admin privileges)"
                        );
                        utils.settings.remove(message.guild, "serv_owner");
                    }
                    else{
                        pwd= _getPassword();
                        utils.settings.set(message.guild, "serv_owner", message.member.id);
                        message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                        message.channel.send("Strashbot srb2kart server restarted…");
                    }
    
                    return true;
                }
            }
            else{
                message.channel.send("Seule la personne qui a lancé le serveur SRB2Kart peut le redémarrer");
                return false;
            }
        }
        else if(["password","pwd","access","admin"].includes(args[0])){
            if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false

            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) || 
                (Boolean(servOwner) && Boolean(owner= await utils.getBotClient().users.fetch(servOwner)) && (owner.id===message.author.id) )
                || !Boolean(servOwner) || !Boolean(owner)
            ){
                pwd= _getPassword();
                message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`)
                return true;
            }

            return false;
        }
        else if(["takeover","claim","seize","force","own","lock","lead","control","ctrl"].includes(args[0])){
            if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }
            if( (clearanceLvl>CLEARANCE_LEVEL.ADMIN_ROLE)
                || !Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().users.fetch(servOwner))
            ){
                pwd= _getPassword();
                await message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                utils.settings.set(message.guild, "serv_owner", message.member.id);
                message.channel.send(`Nouvel admin désigné du serveur SRB2Kart: ${message.member.user}…`);

                return true;
            }
            else{
                message.channel.send(`Le serveur SRB2Kart a toujours un admin désigné (${owner})…`);

                return false;
            }

        }
        else if(["give","chown","transfer"].includes(args[0])){
            if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false

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
            ( Boolean(servOwner) && Boolean(owner= await utils.getBotClient().users.fetch(servOwner)) && owner.id===message.author.id)
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
            if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false

            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (clearanceLvl<=CLEARANCE_LEVEL.ADMIN_ROLE) ||
            ( Boolean(servOwner) && Boolean(owner= await utils.getBotClient().users.fetch(servOwner)) && owner.id===message.author.id)
            ){
                utils.settings.remove(message.guild, "serv_owner");
                message.channel.send(`⚠ Le serveur SRB2Kart n'a plus d'admin désigné… 😢\n`+
                    `\t⚠ Il faut qu'un joueur récupère la propriété en utilisant la commande \`!kart claim\`!`
                );

                return true;
            }
        }
        else if(["server","info","about","?"].includes(args[0])){
            var embed= {}
            embed.title= "StrashBot server"
            embed.color= 0xff0000 //that's red (i hope? this rgba, right?)
            if(_isServerRunning()){
                if((Boolean(kart_settings) && Boolean(kart_settings.server_commands)
                    && Boolean(kart_settings.server_commands.server_addr))
                ){
                    embed.thumbnail= {
                        url: `http://${kart_settings.server_commands.server_addr}/img/server/active_thumb.png`
                    }
                }

                embed.fields=[]

                var servOwner= utils.settings.get(message.guild, "serv_owner")
                var owner= undefined;
                if(Boolean(servOwner) && Boolean(owner= await utils.getBotClient().users.fetch(servOwner))){
                    embed.fields.push({
                        name: 'Responsable',
                        value: `${owner.username}`,
                        inline: true
                    })
                }
                else{
                    embed.fields.push({
                        name: 'Responsable',
                        value: `aucun`,
                        inline: true
                    })
                }

                if (Boolean(kart_settings) && Boolean(kart_settings.server_commands)
                    && Boolean(kart_settings.server_commands.through_ssh)
                ){
                    var _ip= kart_settings.server_commands.server_ip;
                    var _ipValid= Boolean(_ip) && Boolean(_ip.match(/^([0-9]{1,3}\.){3}[0-9]{1,3}$/))
                    var _addr= kart_settings.server_commands.server_addr;

                    embed.fields.push({
                        name: 'Adresse de connexion',
                        value: (
                            (Boolean(_addr)?
                                (`\`${_addr}\``
                                    +`${_ipValid?` (ou \`${_ip}\`)`:''}`
                                )
                            :   (_ipValid?_ip:"inconnue")
                            )
                        ),
                        inline: true
                    })
                }
                else{
                    var net= undefined;
                    if(Boolean(ifaces) && Boolean(ifaces['eth0']) && ifaces['eth0'].length>0 &&
                        ( net= ifaces['eth0'].find(nif => {return Boolean(nif['address'].match(/^([0-9]{1,3}\.){3}[0-9]{1,3}$/))}) )
                    ){
                        embed.fields.push({
                            name: 'Adresse de connexion',
                            value: `\`${net['address']}\``,
                            inline: true
                        })
                    }
                }

                var serverInfos= (await _askServInfos())
                if(Boolean(serverInfos)){
                    var ss= serverInfos.server
                    if(Boolean(ss) && Boolean(ss.servername)
                        && ss.servername.length>0
                    ){
                        embed.title= `${ss.servername}`
                    }
                    if(Boolean(ss) && Boolean(ss.application)
                        && ss.application.length>0
                    ){
                        embed.footer= {
                            text:
                                `---\n${ss.application}` +
                                `${(Boolean(ss.version) && Boolean(ss.subversion))?
                                    ` v${ss.version}.${ss.subversion}`
                                :   ''
                                }`
                        }
                    }

                    embed.fields.push({
                        name: 'Map',
                        value:
                            `${Boolean(ss)?
                                `${ss.mapname} - *${ss.maptitle}*`
                            :   'erreur'
                            }`,
                        inline: true
                    })
                    embed.fields.push({
                        name: "Population",
                        value:
                            `${Boolean(ss)?
                                `${ss.numberofplayer} / ${ss.maxplayer}`
                            :   'erreur'
                            }`,
                        inline: true
                    })

                    var modes= _getServMode()
                    if(Boolean(modes) && modes.length>0){
                        embed.fields.push({
                            name: "Modes",
                            value: modes.join('; '),
                            inline: false
                        })
                    }


                    var players= [], spectators= []
                    var sp= serverInfos.players
                    if(Boolean(sp) && sp.length>0){
                        for (var player of sp){
                            if(!Boolean(player.team) || player.team.length<=0
                                || player.team==="UNKNOWN"
                            )
                                continue
                            else if(player.team==="SPECTATOR"){
                                spectators.push(player.name)
                            }
                            else{
                                players.push(player.name)
                            }
                        }
                    }
                    var s_players='-', s_spectators='-'
                    if(players.length>0){
                        s_players=''
                        for(var name of players){
                            s_players+= `*${name}*;\t `
                        }
                    }
                    if(spectators.length>0){
                        s_spectators=''
                        for(var name of spectators){
                            s_spectators+= `*${name}*;\t `
                        }
                    }

                    embed.fields.push({
                        name: "Players",
                        value: s_players,
                        inline: false
                    })
                    embed.fields.push({
                        name: "Spectators",
                        value: s_spectators,
                        inline: false
                    })
                }
                else{
                    embed.fields.push({
                        name: 'Statut',
                        value: '⚠️ ne répond pas!',
                        inline: true
                    })
                }
            }
            else{
                if((Boolean(kart_settings) && Boolean(kart_settings.server_commands)
                    && Boolean(kart_settings.server_commands.server_addr))
                ){
                    embed.thumbnail= {
                        url: `http://${kart_settings.server_commands.server_addr}/img/server/inactive_thumb.png`
                    }
                }
                embed.fields=[]
                embed.fields.push({
                    name: "Offline",
                    value: "Le serveur semble inactif…",
                    inline: false
                })
            }

            message.channel.send({embed: embed})
            return true
        }
        else if(["code","source","git"].includes(args[0])){
            if(Boolean(kart_settings) && Boolean(kart_settings.source_url)){
                message.channel.send(`SRB2Kart server manager source at: <${kart_settings.source_url}>`);
                
                return true;
            }
            else{
                message.channel.send(`Unavailable…`);

                return false;
            }
        }
        else if (["addons","add-ons","addon","add-on","module","modules","mod","mods"].includes(args[0])){
            return (await _cmd_addons(cmdObj, clearanceLvl, utils))
        }
        else if (["config","startup"].includes(args[0])){
            return (await _cmd_config(cmdObj, clearanceLvl, utils))
        }
        else if (["addon_load","addon_order","order","load_sequence"].includes(args[0])){
            return (await _cmd_addon_load(cmdObj, clearanceLvl, utils))
        }
        else if (["log","logs","log.txt"].includes(args[0])){
            var str= undefined
            try{
                var cmd= __kartCmd(kart_settings.config_commands.get_log);
                str= child_process.execSync(cmd, {timeout: 16000}).toString();
            }
            catch(err){
                hereLog("Error while looking for log.txt: "+err);
                str= undefined
            }
    
            
            if(Boolean(str)){
                if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                    if(Boolean(kart_settings.http_url) ){
                        message.channel.send(`Server's last recorded logs: ${kart_settings.http_url}/${str}`)
                        return true;
                    }
                    else{
                        message.channel.send("❌ server internal error");
                        return false;
                    }
                }
                else{
                    message.channel.send(`Server's last recorded logs:`,
                        {files: [{
                            attachment: `${str}`,
                            name: `log.txt`
                        }]}
                    );
                    return true;
                }
            }
            else{
                message.channel.send("❌ server internal error");
                return false;
            }
        }
        else if(['timetrial','timeattack','time','tt', 'ta'].includes(args[0])){
            return (await _cmd_timetrial(cmdObj, clearanceLvl, utils));
        }
        else if(['register'].includes(args[0])){
            return (await _cmd_register(cmdObj, clearanceLvl, utils));
        }
        else if(Boolean(args[0]) && args[0].match(/^((cle?a?r)|(re?mo?v?e?)|(re?se?t)|(dele?t?e?))[\-\_ ]scores?$/)){
            if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false
            
            if(__clearScores()){
                message.channel.send("Score storage reset.")
                return true
            }
            else{
                message.channel.send("❌ Internal error…")
                return false
            }
        }
        else if(["clip","clips","replay","replays","video","vid","videos"].includes(args[0])){
            return (await _cmd_clip(cmdObj,clearanceLvl,utils));
        }
        else if (args[0]==="help"){
            return cmd_help(cmdObj, clearanceLvl)
        }
    }

    return false;
}


function cmd_help(cmdObj, clearanceLvl){
    cmdObj.msg_obj.author.send(
        "========\n\n"+
        "⚠ **_IMPORTANT:_** SRB2Kart server is exclusively for Strasbourg Smasher's usage.\n\n"+
        `__**kart** command___:\n\n`+
        ((clearanceLvl<CLEARANCE_LEVEL.ADMIN)? "": ("**Admins only (usable in other channels):**\n\n"+
            "\t`!kart role @rolemention`\n\n"+
            "\tset a designated for people who want to kart, y'know?\n\n"+
            "\t`!kart admin_role @rolemention`\n\n"+
            "\tset role for OG karters, have greater access to kart server commands and all...\n\n"+
            "\t`!kart channel #channelmention`\n\n"+
            "\tset which channel gets to be the *designated srb2kart channel*\n\n"+
            "\t`!kart channel clear`\n\n"+
            "\tunset the *designated srb2kart channel*\n\n"+
            "\t`!kart channel which`\n\n"+
            "\ttells which channel is set as the *designated srb2kart channel*\n\n"+
            "**All users commands:**\n\n"
        ))
    );
    cmdObj.msg_obj.author.send(
        "\n**Following commands are only usable in the designated \"srb2kart channel\"!**\n"+
        "\t*(commands that are liste with a preceeding 😎 are commands for 'admin karters' only*)\n\n"+
        "😎\t`!kart start ['stand']`\n\n"+
        "\tTry to start the SRB2Kart server.\n\tIf success, the server password is send via private message, the reciever is considered as the *designated admin* of the server.\n"+
        "\t  If the optional argument `stand` is given, the server will have *__no__ designated admin*…\n\n"+
        "😎\t`!kart stop`\n\n"+
        "\tIf active, attempt to stop the SRB2Kart server.\n\n"+
        "😎\t`!kart restart ['stand']`\n\n"+
        "\tAttempt to restart the SRB2Kart server.\n"+
        "\t  If the optional argument `stand` is given, the server will have *__no__ designated admin*…\n\n"+
        "\t⚠ **_Note:** the SRB2Kart server will automatically shutdown at 4 am. It will restart at 8 am, __unless__ it was stopped manually.\n\n"+
        "😎\t`!kart password`\n\n"+
        "\tRequest to recieve the password of the active (if any) SRB2Kart server. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "😎\t`!kart claim`\n\n"+
        "\tClaim the vacant ownership of the current running (if any) SRB2Kart server. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "😎\t`!kart transfer @usermention`\n\n"+
        "\tGive the ownership of the current running (if any) SRB2Kart server to the mentionned user. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "😎\t`!kart leave`\n\n"+
        "\tGive up the ownership of the current running (if any) SRB2Kart server, leaving it vacant. (designated SRB2Kart server admin only)\n\n"+
        "\t`!kart info`\n\n"+
        "\tDisplay whether of not the SRB2Kart server is running along with its ownership\n"+
        "\tAlso displays the server's ip address.\n\n"+
        "\t`!kart log`\n\n"+
        "\tAllows to download the latest log file generated by the server.\n\n"+
        "\t`!kart source`\n\n"+
        "\tSource code for the used server manager\n\n"+
        "\t`!kart help`\n\n"+
        "\tDisplay this help (PM)\n\n"
    );
    cmdObj.msg_obj.author.send(
        "---\n*SRB2Kart server's addons management:*\n\n"+
        "\t`!kart addons ls [pattern]`\n\n"+
        "\tList all availabe addons under three categories:\n"+
        "\t\t*[Temporary]*: addons that will removed once the current session (or next one if no server is running) is over\n"+
        "\t\t*[Downloaded]*: addons that were added manually\n"+
        "\t\t*[Base]*: addons that are loaded by default\n"+
        "\tIf `[pattern]` is given, this command will search for matching pattern amongs availabe addons.\n"+
        "\t\texample: `!kart addons ls rayman`\n\n"+
        "😎\t`!kart addons add [url]`\n\n"+
        "\tThe addon must be an attachment to the same message as the command, and have a valid addon extension (.pk3,.lua,.wad,.kart)\n\n"+
        "\t⚠ If the kart server is running, this addon will be added under the *[temporary]* section until next session…\n\n"+
        "😎\t`!kart addons rm <addon_filename>`\n\n"+
        "\tRemove the addon designated by the given name from the server.\n"+
        "\t⚠ this only works for addons under the *[downloaded]* section!\n\n"+
        "\t`!kart addons link`\n\n"+
        "\tGet the link to DL a zip archives that contains all of the addons\n\n"+
        "\t`!kart addon_load get`\n\n"+
        "\tAllows to download the current config file that sets rules to set the order in which the addons load when the server starts\n\n"+
        "😎\t`!kart addon_load set`\n\n"+
        "\tDownloads a new version of the addon load order config file onto the server\n"+
        "\t⚠ The new version of the file must be provided as a file attachment to the same message as the command as a text file.\n\n"+
        "\t__Example of `addon_load _order_config.txt`__: making sure *addonA* is loaded firt, *addonB* last, and *addonC* before *addonD*\n"+
        "```\nFIRST: \"addonA.pk3\"\n\"addonC.wad\" < \"addonD.pk3\"\n\"\"LAST: \"addonB.pk3\"\n```\n"
    );
    cmdObj.msg_obj.author.send(
        "----\n*SRB2Kart server's startup config management:*\n\n"+
        "\t`!kart config get`\n\n"+
        "\tAllows to download the current `startup.cfg` config script executed when server starts\n\n"+
        "😎\t`!kart config set`\n\n"+
        "\tDownloads a new version of the `startup.cfg` config script onto the server\n"+
        "\t⚠ The new version of the script must be provided as a file attachment to the same message as the command, and must have `.cfg` extension.\n"+
        "\t⚠ When this config script is downloaded, some commands are filtered out of the script rendering them ineffective.\n"+
        "\t\tYou can obtain a list of said forbidden srb2kart configuration commands with the command below.\n\n"+
        "\t`!kart config filter`\n\n"+
        "\tGives a list of all forbidden srb2kart configuration commands that are filtered out of the `startup.cfg` config startup script.\n\n"
    );
    cmdObj.msg_obj.author.send(
        "----\n*SRB2Kart server's time record management:*\n\n"+
        "\t`!kart time`\n\n"+
        "\tLists all the maps that have a time record submitted.\n\n"+
        "\t`!kart time [map name]`\n\n"+
        "\tLists all the time that were submitter for a given map.\n\n"+
        "\t`!kart time add`\n\n"+
        "\tAdds a new time record on the server given the .lmp file was provided as a message attachment. (One per person per map)\n\n"+
        "\t⚠ The new time record must be provided as a file attachment to the same message as the command, and must have `.lmp` extension.\n"+
        "\t`!kart time rm [map name]`\n\n"+
        "\tRemoves a time record you have submitted for a given map.\n\n"+
        "\t`!kart time get [map name]`\n\n"+
        "\tLink to download uploaded times for a given map.\n\n"
    );
    cmdObj.msg_obj.author.send(
        "----\n*SRB2Kart server's clips library management:*\n\n"+
        "\t`!kart clip`\n\n"+
        "\tAdds a clip `.gif|.ogg|.webm|.mp4`, provided as a message attachement, to the library. (Only `.gif|.ogg|.webm|.mp4` files)\n\n"+
        "\t`!kart clip add <url>`\n\n"+
        "\tAdds a clip, from a given url, to the libraby. The url must be *a direct* `.gif|.ogg|.webm|.mp4` *link*, a *youtube link*, or a streamable.com video link\n\n"+
        "\t`!kart clip info <clip_id>`\n\n"+
        "\tPrint infos for a given clip. (The id of said clip should be displayed in the gallery page)\n\n"+
        "\t`!kart clip rm <clip_id>`\n\n"+
        "\t Removes a given clip from the gallery. (The id of said clip should be displayed in the gallery page)\n"+
        "\t __Note:__ only an admin or the person that referenced the clip in the first place can remove said clip\n\n"+
        "\t`!Kart clip description [bla bla bla]`\n\n"+
        "\tEdit the description of a given clip. (The id of said clip should be displayed in the gallery page)\n\n"+
        "\t`!kart clip outdated`\n\n"+
        "\tShows which clips (if any) of the library are referenced by dead links."
    );
    return true;
}


async function cmd_event(eventName, utils){
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
        if( Boolean(servOwner) && Boolean(m_owner= (await (member.guild.members.fetch(servOwner)))) && m_owner.id===member.id){
            utils.settings.remove(member.guild, "serv_owner");

            if(_isServerRunning()){
                var chanKart= utils.settings.get(member.guild, 'kart_channel');
                var channel= undefined;
                if(Boolean(chanKart) && Boolean(channel= member.guild.channels.cache.get(chanKart))){
                    channel.send(`⚠ Le serveur SRB2Kart n'a plus d'admin désigné… 😢`+
                        `\t⚠ Il faut qu'un joueur récupère la propriété en utilisant la commande \`!kart claim\`!`
                    );
                }
            }
        }
    }
}


function cmd_guild_clear(guild){}

function cmd_destroy(utils){
    hereLog("destroy…");
    if(Boolean(stop_job)){
        delete stop_job;
        stop_job= undefined;
    }
    if(Boolean(start_job)){
        delete start_job;
        start_job= undefined;
    }
    if(Boolean(status_job)){
        delete status_job;
        status_job= undefined;
    }
}


module.exports.name= ['kart'];
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear, destroy: cmd_destroy};
